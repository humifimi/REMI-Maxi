/**
 * P5-CU-2 — verifies the pending-sessions hook hits the right URL,
 * filters by `status=pending_review` (NOT `pending` per the canonical
 * enum / master plan §5.4.2), and sorts results most-recent-first.
 *
 * The 0 / 1 / 5 session matrix is the chunk-prompt test obligation.
 * Sort is exercised via `compareSessionsMostRecentFirst` directly so
 * the comparator is locked even if a future refactor moves the sort
 * into the queryFn.
 */
import { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';

import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import {
  compareSessionsMostRecentFirst,
  reorganizationKeys,
  usePendingReorganizationCount,
  usePendingReorganizationSessions,
} from '@customer/hooks/reorganizations/use-pending-sessions';
import type { CustomerVisibleSession } from '@customer/types/reorganization';

notifyManager.setScheduler((cb) => cb());
notifyManager.setBatchNotifyFunction((fn) => fn());

jest.mock('@customer/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const getMock = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function makeSession(
  overrides: Partial<CustomerVisibleSession> = {},
): CustomerVisibleSession {
  return {
    id: 1,
    source: 'tech_app',
    status: 'pending_review',
    intents: [],
    expires_at: null,
    created_at: '2026-04-21T12:00:00.000Z',
    finalized_at: '2026-04-21T12:00:01.000Z',
    committed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function envelope(body: unknown) {
  return { data: { error: false, message: 'ok', data: body } };
}

beforeEach(() => {
  getMock.mockReset();
});

describe('usePendingReorganizationSessions (P5-CU-2)', () => {
  it('issues GET /reorganizations with ?status=pending_review', async () => {
    getMock.mockResolvedValueOnce(envelope([]) as never);

    const { result } = renderHook(() => usePendingReorganizationSessions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    const [url, config] = getMock.mock.calls[0];
    expect(url).toBe(ENDPOINTS.REORGANIZATIONS.LIST);
    // PLAN-DEVIATION: 2026-05-02-pending-review-status-filter — this
    // assertion locks the contract: the chunk-prompt body said
    // `?status=pending` but the canonical enum value is `pending_review`.
    expect(config?.params).toEqual({ status: 'pending_review' });
  });

  it('unwraps { sessions: [...] } from the BE list envelope', async () => {
    const single = makeSession({ id: 7 });
    getMock.mockResolvedValueOnce(envelope({ sessions: [single] }) as never);

    const { result } = renderHook(() => usePendingReorganizationSessions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.id).toBe(7);
  });

  it('returns an empty array when the BE has no pending sessions (zero case)', async () => {
    getMock.mockResolvedValueOnce(envelope({ sessions: [] }) as never);

    const { result } = renderHook(() => usePendingReorganizationSessions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('passes through a single session unchanged (one case)', async () => {
    const single = makeSession({ id: 42, source: 'franchise_dashboard' });
    getMock.mockResolvedValueOnce(envelope([single]) as never);

    const { result } = renderHook(() => usePendingReorganizationSessions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toMatchObject({
      id: 42,
      source: 'franchise_dashboard',
    });
  });

  it('returns five sessions sorted most-recent-first (five case)', async () => {
    // Inserted out of order; the hook should sort by finalized_at desc
    // (falling back to created_at when finalized_at is null) per §5.4.4.
    const sessions: CustomerVisibleSession[] = [
      makeSession({ id: 1, finalized_at: '2026-04-20T09:00:00.000Z' }),
      makeSession({ id: 2, finalized_at: '2026-04-21T09:00:00.000Z' }),
      makeSession({ id: 3, finalized_at: null, created_at: '2026-04-22T09:00:00.000Z' }),
      makeSession({ id: 4, finalized_at: '2026-04-19T09:00:00.000Z' }),
      makeSession({ id: 5, finalized_at: '2026-04-23T09:00:00.000Z' }),
    ];
    getMock.mockResolvedValueOnce(envelope(sessions) as never);

    const { result } = renderHook(() => usePendingReorganizationSessions(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = result.current.data?.map((s) => s.id);
    // 5 finalized 2026-04-23 → 3 created 2026-04-22 → 2 finalized 2026-04-21 → 1 finalized 2026-04-20 → 4 finalized 2026-04-19
    expect(ids).toEqual([5, 3, 2, 1, 4]);
  });
});

describe('compareSessionsMostRecentFirst', () => {
  it('uses finalized_at when present', () => {
    const newer = makeSession({ id: 1, finalized_at: '2026-05-02T10:00:00.000Z' });
    const older = makeSession({ id: 2, finalized_at: '2026-05-01T10:00:00.000Z' });
    expect(compareSessionsMostRecentFirst(newer, older)).toBeLessThan(0);
    expect(compareSessionsMostRecentFirst(older, newer)).toBeGreaterThan(0);
  });

  it('falls back to created_at when finalized_at is null', () => {
    const a = makeSession({
      id: 1,
      finalized_at: null,
      created_at: '2026-05-02T10:00:00.000Z',
    });
    const b = makeSession({
      id: 2,
      finalized_at: '2026-05-01T10:00:00.000Z',
    });
    expect(compareSessionsMostRecentFirst(a, b)).toBeLessThan(0);
  });

  it('breaks ties by id desc so the order is deterministic', () => {
    const a = makeSession({ id: 5, finalized_at: '2026-05-02T10:00:00.000Z' });
    const b = makeSession({ id: 7, finalized_at: '2026-05-02T10:00:00.000Z' });
    // Same timestamp → larger id wins (newer record)
    expect(compareSessionsMostRecentFirst(b, a)).toBeLessThan(0);
  });
});

describe('usePendingReorganizationCount (Home-tab badge)', () => {
  it('returns 0 while the request is still in flight', async () => {
    let resolve!: (value: unknown) => void;
    getMock.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }) as never,
    );

    const { result, unmount } = renderHook(() => usePendingReorganizationCount(), {
      wrapper: makeWrapper(),
    });

    expect(result.current).toBe(0);
    // Resolve so the test doesn't leak a pending promise.
    resolve(envelope([]));
    await waitFor(() => expect(getMock).toHaveBeenCalled());
    unmount();
  });

  it('returns the session count once the response arrives', async () => {
    const sessions = [
      makeSession({ id: 1 }),
      makeSession({ id: 2 }),
      makeSession({ id: 3 }),
    ];
    getMock.mockResolvedValueOnce(envelope(sessions) as never);

    const { result } = renderHook(() => usePendingReorganizationCount(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(3));
  });

  it('returns 0 on network error (silent-empty by design — see hook docstring)', async () => {
    getMock.mockRejectedValueOnce(new Error('Network down'));

    const { result } = renderHook(() => usePendingReorganizationCount(), {
      wrapper: makeWrapper(),
    });

    // The query goes to error state, but the badge selector returns 0
    // because data is undefined. The screen surfaces the error state
    // directly — see app/inbox/approvals.tsx error branch.
    await waitFor(() => expect(result.current).toBe(0));
  });
});

describe('reorganizationKeys', () => {
  it('produces stable, parameterized cache keys', () => {
    expect(reorganizationKeys.list('pending_review')).toEqual([
      'reorganizations',
      'list',
      'pending_review',
    ]);
    expect(reorganizationKeys.list('all')).toEqual([
      'reorganizations',
      'list',
      'all',
    ]);
  });
});
