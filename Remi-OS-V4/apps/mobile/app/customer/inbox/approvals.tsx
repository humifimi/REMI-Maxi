/**
 * P5-CU-2 — Approval inbox screen.
 *
 * Lists every reorganization session affecting this customer that is
 * currently in `pending_review`, ordered most-recent-first per master
 * plan §5.4.4. Opened today from the Home-tab inbox button (see the
 * `tray.fill` button in `app/(tabs)/index.tsx`); the push-notification
 * deep-link path lands when P5-CU-1 ships and updates
 * `src/services/push-notifications.ts` to route `kind: 'approval_request'`
 * to this route.
 *
 * Tap on a row pushes to `/customer/inbox/approvals/[sessionId]` (D.5 / P5-CU-5,
 * not yet shipped). The chunk-prompt body says we should still wire the
 * navigation now so the row's primary affordance is correct on day one;
 * the destination screen renders a 404-safe placeholder until D.5 lands.
 *
 * PLAN-DEVIATION: 2026-05-02-no-gorhom-bottom-sheet — master plan
 * §1.4.8 + §5.4.2 hand the chunk a `@gorhom/bottom-sheet` implementation
 * but the package is not actually installed in this app and there is no
 * `BottomSheetModalProvider` mounted (master plan §1.4.2 also overstated
 * the providers tree). We use Expo Router's built-in `presentation:
 * 'modal'` instead — same iOS sheet UX, no new dep, OTA-eligible. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-no-gorhom-bottom-sheet`.
 */

import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EmptyState } from '@customer/components/shared/empty-state';
import {
  Theme,
  getPendingSourceVisuals,
  type PendingSourceKey,
} from '@customer/constants/colors';
import {
  formatScheduledDate,
  formatScheduledTime,
} from '@customer/utils/date-format';
import { usePendingReorganizationSessions } from '@customer/hooks/reorganizations/use-pending-sessions';
import type {
  CustomerVisibleIntent,
  CustomerVisibleSession,
} from '@customer/types/reorganization';

export default function ApprovalInboxScreen() {
  const router = useRouter();
  const {
    data: sessions,
    isPending,
    isError,
    isRefetching,
    refetch,
  } = usePendingReorganizationSessions();

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/customer');
    }
  }, [router]);

  const handleRowPress = useCallback(
    (session: CustomerVisibleSession) => {
      // D.5 / P5-CU-5 — per-session detail action sheet. The string cast
      // is kept because Expo Router's auto-generated route map for the
      // dynamic `[sessionId]` segment isn't always inferred (depends on
      // the typed-routes setting); the runtime path is correct either way.
      router.push(`/customer/inbox/approvals/${session.id}` as never);
    },
    [router],
  );

  const content = useMemo(() => {
    if (isPending) {
      return (
        <ActivityIndicator
          color={Theme.colors.primary}
          style={styles.loader}
          testID="inbox-loader"
        />
      );
    }
    // Customer-app override #4 + #5: surface a real failure state on
    // network error rather than letting it fall through to "no pending
    // changes" (the silent-empty footgun from §1.5 C1).
    if (isError) {
      return (
        <EmptyState
          title="Couldn't load your inbox"
          message="We're having trouble reaching the server. Check your connection and try again."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      );
    }
    const list = sessions ?? [];
    if (list.length === 0) {
      return (
        <EmptyState
          title="All caught up"
          message="You have no pending changes to review."
          actionLabel="Refresh"
          onAction={() => refetch()}
        />
      );
    }
    return (
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={Theme.colors.primary}
          />
        }
        renderItem={({ item }) => (
          <ApprovalRow session={item} onPress={() => handleRowPress(item)} />
        )}
        ItemSeparatorComponent={Separator}
      />
    );
  }, [handleRowPress, isError, isPending, isRefetching, refetch, sessions]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pending changes</Text>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close inbox"
          testID="inbox-close-button"
        >
          <IconSymbol name="xmark" size={22} color={Theme.colors.text} />
        </Pressable>
      </View>
      <View style={styles.body}>{content}</View>
    </SafeAreaView>
  );
}

interface ApprovalRowProps {
  session: CustomerVisibleSession;
  onPress: () => void;
}

function ApprovalRow({ session, onPress }: ApprovalRowProps) {
  const visuals = getPendingSourceVisuals(session.source as PendingSourceKey);
  const summary = summarizeIntents(session.intents);
  const timestamp = formatRelativeTimestamp(
    session.finalized_at ?? session.created_at,
  );

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pending change from ${visuals.label}: ${summary}`}
      testID={`inbox-session-row-${session.id}`}
    >
      <View style={styles.rowHeader}>
        <View
          style={[styles.sourceBadge, { backgroundColor: visuals.background }]}
          testID={`inbox-source-badge-${session.source}`}
        >
          <Text style={[styles.sourceBadgeLabel, { color: visuals.color }]}>
            {visuals.label}
          </Text>
        </View>
        <Text style={styles.timestamp}>{timestamp}</Text>
      </View>
      <Text style={styles.summary} numberOfLines={2}>
        {summary}
      </Text>
      <Text style={styles.cta}>Tap to review →</Text>
    </TouchableOpacity>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/**
 * One-line summary of the intents inside a session. Customer-visible
 * sessions only ever carry `reschedule | cancel` intents (master plan
 * §3.8.4), so the renderer is two-branch + a fallback for forward-
 * compatibility. Multi-intent sessions show the first intent's label
 * with an "+ N more" suffix; the per-session detail screen (D.5) is
 * where the customer drills in for the full list.
 */
export function summarizeIntents(intents: CustomerVisibleIntent[]): string {
  if (intents.length === 0) return 'Pending change';
  const first = intents[0];
  const rest = intents.length - 1;
  const head = describeIntent(first);
  return rest > 0 ? `${head} + ${rest} more` : head;
}

function describeIntent(intent: CustomerVisibleIntent): string {
  if (intent.payload.kind === 'reschedule') {
    const date = formatScheduledDate(intent.payload.new_scheduled_date);
    const time = formatScheduledTime(intent.payload.new_start_time);
    return `Reschedule to ${date} at ${time}`;
  }
  if (intent.payload.kind === 'cancel') {
    return 'Cancel appointment';
  }
  // Defensive: customer-visible filter (§3.8.4) should never let other
  // payload kinds through, but BE drift is possible.
  return 'Pending change';
}

/**
 * "5 minutes ago" / "2 hours ago" / "Yesterday" / "Apr 15" formatter
 * scoped to this screen. Master plan §5.4.4 doesn't pin a relative-time
 * library, and the customer's mental model here is "how long has this
 * been waiting on me" — relative is the right shape.
 */
export function formatRelativeTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'Just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.colors.borderLight,
  },
  headerTitle: {
    fontSize: Theme.fontSize.xl,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  body: {
    flex: 1,
  },
  loader: {
    marginTop: Theme.spacing.xl,
  },
  listContent: {
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.xl,
  },
  row: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: Theme.borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: Theme.colors.warning,
    padding: Theme.spacing.md,
    minHeight: 88, // 44pt touch target × 2 lines of text comfortably.
    ...Theme.shadow.md,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.sm,
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
    alignSelf: 'flex-start',
  },
  sourceBadgeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.textTertiary,
  },
  summary: {
    fontSize: Theme.fontSize.md,
    fontWeight: '500',
    color: Theme.colors.text,
    marginBottom: 6,
  },
  cta: {
    fontSize: Theme.fontSize.xs,
    color: Theme.colors.primary,
    fontWeight: '600',
  },
  separator: {
    height: Theme.spacing.sm,
  },
});
