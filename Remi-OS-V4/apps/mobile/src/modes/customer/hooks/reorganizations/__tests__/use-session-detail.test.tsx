/**
 * P5-CU-5 — verifies the per-session detail + respond + counter-propose
 * hooks talk to the right URLs with the right bodies, attach an
 * `Idempotency-Key` header, and discriminate the 422 linter rejection
 * shape from generic network errors.
 *
 * The chunk-prompt's hard test obligations are:
 *   - each CTA fires the correct mutation with the correct body
 *   - 422 surfaces inline (the hook's 422 path is what the screen
 *     downstream turns into the inline LinterRejectionBlock)
 *
 * The screen's wiring of those branches is exercised in the screen's
 * own test file (`app/inbox/approvals/__tests__/[sessionId].test.tsx`).
 *
 * PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape — the
 * URL assertions on the respond hook lock the `/respond` endpoint that
 * §6.2 specifies, NOT the `/approve` and `/deny` endpoints from §8.9
 * Prompt D.5. Same precedent as P5-CU-2's status-filter test.
 */
import { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';

import apiClient from '@customer/api/client';
import {
  extractLinterRejection,
  reorganizationDetailKeys,
  useCounterProposeReorganizationSession,
  useReorganizationSession,
  useRespondToReorganizationSession,
} from '@customer/hooks/reorganizations/use-session-detail';
import type {
  CustomerVisibleSession,
  ReschedulePayload,
} from '@customer/types/reorganization';

notifyManager.setScheduler((cb) => cb());
notifyManager.setBatchNotifyFunction((fn) => fn());

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const getMock = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const postMock = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function envelope(body: unknown) {
  return { data: { error: false, message: 'ok', data: body } };
}

function makeSession(
  overrides: Partial<CustomerVisibleSession> = {},
): CustomerVisibleSession {
  return {
    id: 42,
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

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
});

describe('useReorganizationSession (P5-CU-5)', () => {
  it('issues GET /reorganizations/:id when sessionId is set', async () => {
    getMock.mockResolvedValueOnce(envelope(makeSession({ id: 17 })) as never);

    const { result } = renderHook(() => useReorganizationSession(17), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0][0]).toBe('/reorganizations/17');
    expect(result.current.data?.id).toBe(17);
  });

  it('does NOT fire when sessionId is null (route-param missing case)', async () => {
    const { result } = renderHook(() => useReorganizationSession(null), {
      wrapper: makeWrapper(),
    });

    // Pause for next tick to confirm no request was scheduled.
    await new Promise((r) => setTimeout(r, 10));
    expect(getMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('produces a stable cache key per session id', () => {
    expect(reorganizationDetailKeys.detail(99)).toEqual([
      'reorganizations',
      'detail',
      99,
    ]);
  });
});

describe('useRespondToReorganizationSession — approve (P5-CU-5)', () => {
  it('POSTs /respond with action=approve and an Idempotency-Key header', async () => {
    postMock.mockResolvedValueOnce(
      envelope({
        session: makeSession({ id: 42, status: 'committed' }),
        auto_committed: true,
      }) as never,
    );

    const { result } = renderHook(() => useRespondToReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let mutateResult;
    await act(async () => {
      mutateResult = await result.current.mutateAsync({
        sessionId: 42,
        action: 'approve',
      });
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    // PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape — locks
    // the URL contract: spec body §6.2 wins over §8.9 Prompt D.5.
    expect(url).toBe('/reorganizations/42/respond');
    expect(body).toEqual({ action: 'approve' });
    expect(config?.headers?.['Idempotency-Key']).toEqual(
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/),
    );
    expect(mutateResult).toMatchObject({ autoCommitted: true });
  });

  it('normalizes a bare-CustomerVisibleSession response (no `session` envelope) to autoCommitted=false when status != committed', async () => {
    postMock.mockResolvedValueOnce(
      envelope(makeSession({ id: 42, status: 'pending_review' })) as never,
    );

    const { result } = renderHook(() => useRespondToReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let mutateResult;
    await act(async () => {
      mutateResult = await result.current.mutateAsync({
        sessionId: 42,
        action: 'approve',
      });
    });

    expect(mutateResult).toMatchObject({ autoCommitted: false });
  });

  it('surfaces a 422 linter rejection error verbatim so the screen can render the issues inline', async () => {
    const issues = [
      { rule_id: 'R1-tech-capacity-overlap', severity: 'error', message: 'Tech is double-booked at 10:30.' },
    ];
    const axiosError: any = new Error('linter');
    axiosError.response = {
      status: 422,
      data: {
        error: true,
        message: 'linter_errors_block_finalize',
        data: { issues },
      },
    };
    postMock.mockRejectedValueOnce(axiosError);

    const { result } = renderHook(() => useRespondToReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ sessionId: 42, action: 'approve' });
      } catch (e) {
        caught = e;
      }
    });

    const rejection = extractLinterRejection(caught);
    expect(rejection?.issues).toEqual(issues);
  });
});

describe('useRespondToReorganizationSession — decline (P5-CU-5)', () => {
  it('POSTs /respond with action=decline and the structured reason fields', async () => {
    postMock.mockResolvedValueOnce(
      envelope(makeSession({ id: 42, status: 'cancelled' })) as never,
    );

    const { result } = renderHook(() => useRespondToReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 42,
        action: 'decline',
        declineReasonKind: 'inconvenient_time',
        declineReasonText: '6am is too early for me',
      });
    });

    const [url, body] = postMock.mock.calls[0];
    expect(url).toBe('/reorganizations/42/respond');
    expect(body).toEqual({
      action: 'decline',
      decline_reason_kind: 'inconvenient_time',
      decline_reason_text: '6am is too early for me',
    });
  });

  it('omits decline_reason_text when not provided (free-text is optional except for "Other")', async () => {
    postMock.mockResolvedValueOnce(
      envelope(makeSession({ id: 42, status: 'cancelled' })) as never,
    );

    const { result } = renderHook(() => useRespondToReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 42,
        action: 'decline',
        declineReasonKind: 'inconvenient_time',
      });
    });

    const [, body] = postMock.mock.calls[0];
    expect(body).toEqual({
      action: 'decline',
      decline_reason_kind: 'inconvenient_time',
    });
  });
});

describe('useCounterProposeReorganizationSession (P5-CU-5)', () => {
  it('POSTs /counter-propose with the new initial_intents body + Idempotency-Key', async () => {
    postMock.mockResolvedValueOnce(
      envelope(
        makeSession({
          id: 99,
          source: 'customer_app',
          status: 'pending_review',
        }),
      ) as never,
    );

    const { result } = renderHook(
      () => useCounterProposeReorganizationSession(),
      { wrapper: makeWrapper() },
    );

    const intent: ReschedulePayload = {
      kind: 'reschedule',
      appointment_id: 7,
      new_scheduled_date: '2026-04-25',
      new_start_time: '14:00',
      new_end_time: '15:00',
      new_technician_id: 3,
    };

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: 42,
        initialIntents: [intent],
      });
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toBe('/reorganizations/42/counter-propose');
    expect(body).toEqual({ initial_intents: [intent] });
    expect(config?.headers?.['Idempotency-Key']).toEqual(
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/),
    );
  });

  it('surfaces network errors so the screen can show "Could not send your suggestion"', async () => {
    postMock.mockRejectedValueOnce(new Error('Network down'));

    const { result } = renderHook(
      () => useCounterProposeReorganizationSession(),
      { wrapper: makeWrapper() },
    );

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          sessionId: 42,
          initialIntents: [
            {
              kind: 'reschedule',
              appointment_id: 7,
              new_scheduled_date: '2026-04-25',
              new_start_time: '14:00',
              new_end_time: '15:00',
            },
          ],
        });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(extractLinterRejection(caught)).toBeNull();
  });
});

describe('extractLinterRejection (P5-CU-5)', () => {
  it('returns null for a non-422 response', () => {
    const err: any = new Error('500');
    err.response = { status: 500, data: { message: 'oops', data: null } };
    expect(extractLinterRejection(err)).toBeNull();
  });

  it('returns null for a 422 with a different message (so non-linter 422s do not look like linter failures)', () => {
    const err: any = new Error('422');
    err.response = {
      status: 422,
      data: { message: 'validation_failed', data: { fieldErrors: [] } },
    };
    expect(extractLinterRejection(err)).toBeNull();
  });

  it('returns the issues array when the BE 422s with linter_errors_block_finalize', () => {
    const issues = [{ rule_id: 'R1', severity: 'error', message: 'Conflict.' }];
    const err: any = new Error('422');
    err.response = {
      status: 422,
      data: {
        message: 'linter_errors_block_finalize',
        data: { issues },
      },
    };
    expect(extractLinterRejection(err)?.issues).toEqual(issues);
  });

  it('returns null when issues is missing or not an array', () => {
    const err: any = new Error('422');
    err.response = {
      status: 422,
      data: {
        message: 'linter_errors_block_finalize',
        data: { issues: 'oops' },
      },
    };
    expect(extractLinterRejection(err)).toBeNull();
  });
});
