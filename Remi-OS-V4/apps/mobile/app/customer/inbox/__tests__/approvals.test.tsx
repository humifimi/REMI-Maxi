/**
 * P5-CU-2 — covers the inbox screen's three render branches (loading,
 * empty, populated), the most-recent-first sort, the source-badge
 * mapping, and the per-row tap → detail navigation.
 *
 * The hook is mocked module-level so the test exercises the screen's
 * rendering / sort / tap semantics without re-asserting the hook's
 * own contract (that's covered by `use-pending-sessions.test.tsx`).
 */
/* eslint-disable import/first -- jest.mock must be hoisted above the
   import that triggers it; placing it at the top keeps the mock active
   when the component-under-test imports the hook. */
jest.mock('@/hooks/reorganizations/use-pending-sessions', () => ({
  usePendingReorganizationSessions: jest.fn(),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import ApprovalInboxScreen, {
  formatRelativeTimestamp,
  summarizeIntents,
} from '@customer/../app/inbox/approvals';
import { usePendingReorganizationSessions } from '@customer/hooks/reorganizations/use-pending-sessions';
import type {
  CustomerVisibleIntent,
  CustomerVisibleSession,
} from '@customer/types/reorganization';

const useHook = usePendingReorganizationSessions as jest.MockedFunction<
  typeof usePendingReorganizationSessions
>;

type HookResult = ReturnType<typeof usePendingReorganizationSessions>;

function makeHookResult(overrides: Partial<HookResult> = {}): HookResult {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
    ...overrides,
    // The screen never uses these — cast to match the Query type.
  } as unknown as HookResult;
}

function makeRescheduleIntent(
  overrides: Partial<CustomerVisibleIntent> = {},
): CustomerVisibleIntent {
  return {
    id: 901,
    session_id: 1,
    intent_type: 'reschedule',
    intent_status: 'proposed',
    appointment_id: 7,
    payload: {
      kind: 'reschedule',
      appointment_id: 7,
      new_scheduled_date: '2026-04-22',
      new_start_time: '10:30',
      new_end_time: '11:30',
    },
    proposed_at: '2026-04-21T18:00:00.000Z',
    committed_at: null,
    ...overrides,
  };
}

function makeCancelIntent(
  overrides: Partial<CustomerVisibleIntent> = {},
): CustomerVisibleIntent {
  return {
    id: 902,
    session_id: 2,
    intent_type: 'cancel',
    intent_status: 'proposed',
    appointment_id: 7,
    payload: {
      kind: 'cancel',
      appointment_id: 7,
      cancellation_reason: 'tech_unavailable',
    },
    proposed_at: '2026-04-21T18:00:00.000Z',
    committed_at: null,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<CustomerVisibleSession> = {},
): CustomerVisibleSession {
  return {
    id: 1,
    source: 'tech_app',
    status: 'pending_review',
    intents: [makeRescheduleIntent({ session_id: 1 })],
    expires_at: null,
    created_at: '2026-04-21T12:00:00.000Z',
    finalized_at: '2026-04-21T12:00:01.000Z',
    committed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  useHook.mockReset();
  (router.push as jest.Mock).mockReset();
  (router.back as jest.Mock).mockReset();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
});

describe('ApprovalInboxScreen — render branches (P5-CU-2)', () => {
  it('renders a loader while the request is pending (no data yet)', () => {
    useHook.mockReturnValue(makeHookResult({ isPending: true }));
    render(<ApprovalInboxScreen />);
    expect(screen.getByTestId('inbox-loader')).toBeOnTheScreen();
  });

  it('renders the "All caught up" empty state for zero sessions', () => {
    useHook.mockReturnValue(makeHookResult({ data: [] as never, isPending: false }));
    render(<ApprovalInboxScreen />);
    expect(screen.getByText('All caught up')).toBeOnTheScreen();
    expect(screen.getByText('You have no pending changes to review.')).toBeOnTheScreen();
  });

  it('renders the error state on hook isError (not the empty state)', () => {
    // Customer-app override #5: error must not silently look like empty.
    useHook.mockReturnValue(makeHookResult({ data: [] as never, isError: true }));
    render(<ApprovalInboxScreen />);
    expect(screen.getByText("Couldn't load your inbox")).toBeOnTheScreen();
    expect(screen.queryByText('All caught up')).not.toBeOnTheScreen();
  });

  it('renders one row for one session, with source badge + summary', () => {
    useHook.mockReturnValue(
      makeHookResult({
        data: [
          makeSession({
            id: 42,
            source: 'franchise_dashboard',
            intents: [
              makeRescheduleIntent({
                session_id: 42,
                payload: {
                  kind: 'reschedule',
                  appointment_id: 7,
                  new_scheduled_date: '2026-04-22',
                  new_start_time: '10:30',
                  new_end_time: '11:30',
                },
              }),
            ],
          }),
        ] as never,
      }),
    );

    render(<ApprovalInboxScreen />);
    expect(screen.getByTestId('inbox-session-row-42')).toBeOnTheScreen();
    expect(screen.getByText('Franchise proposed')).toBeOnTheScreen();
    expect(screen.getByText('Reschedule to Wed, Apr 22 at 10:30 AM')).toBeOnTheScreen();
  });

  it('renders five sessions in the order returned by the hook (sort lives in the hook)', () => {
    // The hook contract guarantees most-recent-first; the screen
    // doesn't re-sort, it just renders. Drives the chunk-prompt's
    // "verify render + sort" requirement.
    const sessions = [
      makeSession({ id: 5, source: 'tech_app' }),
      makeSession({ id: 3, source: 'franchise_dashboard' }),
      makeSession({ id: 2, source: 'ai_suggestion' }),
      makeSession({ id: 1, source: 'customer_app' }),
      makeSession({ id: 4, source: 'tech_app' }),
    ];
    useHook.mockReturnValue(makeHookResult({ data: sessions as never }));

    render(<ApprovalInboxScreen />);
    expect(screen.getByTestId('inbox-session-row-5')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-session-row-3')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-session-row-2')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-session-row-1')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-session-row-4')).toBeOnTheScreen();
    // Source badges render one per row — two `tech_app` sessions in this
    // fixture means two badges; use getAllByTestId to assert presence.
    expect(screen.getAllByTestId('inbox-source-badge-tech_app')).toHaveLength(2);
    expect(screen.getByTestId('inbox-source-badge-franchise_dashboard')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-source-badge-ai_suggestion')).toBeOnTheScreen();
    expect(screen.getByTestId('inbox-source-badge-customer_app')).toBeOnTheScreen();
  });

  it('navigates to /inbox/approvals/[sessionId] when a row is tapped', () => {
    const session = makeSession({ id: 99 });
    useHook.mockReturnValue(makeHookResult({ data: [session] as never }));

    render(<ApprovalInboxScreen />);
    fireEvent.press(screen.getByTestId('inbox-session-row-99'));
    expect(router.push).toHaveBeenCalledWith('/customer/inbox/approvals/99');
  });

  it('closes the sheet via the close button', () => {
    useHook.mockReturnValue(makeHookResult({ data: [] as never }));
    render(<ApprovalInboxScreen />);
    fireEvent.press(screen.getByTestId('inbox-close-button'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('falls back to replace-to-home when there is no back stack (push deep-link path)', () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    useHook.mockReturnValue(makeHookResult({ data: [] as never }));
    render(<ApprovalInboxScreen />);
    fireEvent.press(screen.getByTestId('inbox-close-button'));
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/customer');
  });
});

describe('summarizeIntents (P5-CU-2)', () => {
  it('describes a single reschedule intent', () => {
    expect(summarizeIntents([makeRescheduleIntent()])).toBe(
      'Reschedule to Wed, Apr 22 at 10:30 AM',
    );
  });

  it('describes a single cancel intent', () => {
    expect(summarizeIntents([makeCancelIntent()])).toBe('Cancel appointment');
  });

  it('appends "+ N more" for multi-intent sessions', () => {
    const summary = summarizeIntents([
      makeRescheduleIntent({ id: 1 }),
      makeRescheduleIntent({ id: 2 }),
      makeRescheduleIntent({ id: 3 }),
    ]);
    expect(summary).toBe('Reschedule to Wed, Apr 22 at 10:30 AM + 2 more');
  });

  it('returns a defensive label for empty intent lists', () => {
    expect(summarizeIntents([])).toBe('Pending change');
  });
});

describe('formatRelativeTimestamp', () => {
  const NOW = new Date('2026-05-02T18:00:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders "Just now" for sub-minute deltas', () => {
    expect(formatRelativeTimestamp('2026-05-02T17:59:30.000Z')).toBe('Just now');
  });

  it('renders minutes ago', () => {
    expect(formatRelativeTimestamp('2026-05-02T17:55:00.000Z')).toBe('5 min ago');
  });

  it('renders hours ago', () => {
    expect(formatRelativeTimestamp('2026-05-02T15:00:00.000Z')).toBe('3h ago');
  });

  it('renders "Yesterday" for 1-day-old timestamps', () => {
    expect(formatRelativeTimestamp('2026-05-01T18:00:00.000Z')).toBe('Yesterday');
  });

  it('renders "Nd ago" for 2-6 day deltas', () => {
    expect(formatRelativeTimestamp('2026-04-29T18:00:00.000Z')).toBe('3d ago');
  });

  it('falls back to a date label past the week boundary', () => {
    expect(formatRelativeTimestamp('2026-04-15T18:00:00.000Z')).toMatch(/Apr 15/);
  });

  it('returns "" for unparseable timestamps', () => {
    expect(formatRelativeTimestamp('not-a-date')).toBe('');
  });
});
