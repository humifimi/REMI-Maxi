/**
 * P5-CU-3 — verifies that `useRescheduleAppointment` and
 * `useCancelAppointment` POST to `/reorganizations` (the new mint
 * endpoint), branch on the response's `auto_committed` flag, and pass
 * a fresh `Idempotency-Key` per submit attempt.
 *
 * The hooks themselves still own the demo-store fast-path (negative
 * appointment ids) — those branches are exercised by the booking-flow
 * tests, not here. This file focuses on the production network shape.
 */
import { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';

import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import {
  useRescheduleAppointment,
  useCancelAppointment,
} from '@customer/hooks/appointments/use-appointments';
import type { CustomerVisibleSession } from '@customer/types/reorganization';

// Run TanStack Query subscriber notifications synchronously so the post-mutation
// state updates resolve inside the test's `act()` block (otherwise they fire on
// a 0-ms timer that React Test Renderer flags as un-act'd updates and that
// keeps Jest's open-handle watchdog ticking for ~5min after the suite passes).
notifyManager.setScheduler((cb) => cb());
notifyManager.setBatchNotifyFunction((fn) => fn());

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

const postMock = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
const getMock = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function makeSession(
  overrides: Partial<CustomerVisibleSession> = {},
): CustomerVisibleSession {
  return {
    id: 42,
    source: 'customer_app',
    status: 'committed',
    intents: [],
    expires_at: null,
    created_at: '2026-04-21T15:00:00.000Z',
    finalized_at: '2026-04-21T15:00:01.000Z',
    committed_at: '2026-04-21T15:00:01.000Z',
    cancelled_at: null,
    ...overrides,
  };
}

function makeEnvelope(body: unknown) {
  return { data: { error: false, message: 'ok', data: body } };
}

beforeEach(() => {
  postMock.mockReset();
  getMock.mockReset();
});

describe('useRescheduleAppointment (P5-CU-3)', () => {
  it('mints a single-intent reschedule session and reports auto-commit when the franchise allows it', async () => {
    postMock.mockResolvedValueOnce(
      makeEnvelope({ session: makeSession({ status: 'committed' }), auto_committed: true }) as never,
    );

    const { result } = renderHook(() => useRescheduleAppointment(), {
      wrapper: makeWrapper(),
    });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({
        appointmentId: 1234,
        body: { scheduledDate: '2026-05-01', scheduledTime: '09:00' },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toBe(ENDPOINTS.REORGANIZATIONS.CREATE);
    expect(body).toMatchObject({
      finalize_immediately: true,
      initial_intents: [
        {
          kind: 'reschedule',
          appointment_id: 1234,
          new_scheduled_date: '2026-05-01',
          new_start_time: '09:00',
          new_end_time: '10:00', // default 60-min duration when no services on cache
        },
      ],
    });
    expect(config?.headers?.['Idempotency-Key']).toEqual(expect.any(String));

    expect(returned).toMatchObject({
      appointmentId: 1234,
      newDate: '2026-05-01',
      newTime: '09:00',
      requiresApproval: false,
      sessionId: 42,
    });
  });

  it('flips requiresApproval=true when the session lands in pending_review', async () => {
    postMock.mockResolvedValueOnce(
      makeEnvelope({
        session: makeSession({ status: 'pending_review', committed_at: null }),
        auto_committed: false,
      }) as never,
    );

    const { result } = renderHook(() => useRescheduleAppointment(), {
      wrapper: makeWrapper(),
    });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({
        appointmentId: 1234,
        body: { scheduledDate: '2026-05-01', scheduledTime: '09:00' },
      });
    });

    expect(returned).toMatchObject({
      requiresApproval: true,
      sessionId: 42,
    });
  });

  it('regenerates the Idempotency-Key on every submit attempt', async () => {
    postMock.mockResolvedValue(
      makeEnvelope({ session: makeSession(), auto_committed: true }) as never,
    );

    const { result } = renderHook(() => useRescheduleAppointment(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        appointmentId: 1234,
        body: { scheduledDate: '2026-05-01', scheduledTime: '09:00' },
      });
    });
    await act(async () => {
      await result.current.mutateAsync({
        appointmentId: 1234,
        body: { scheduledDate: '2026-05-02', scheduledTime: '10:00' },
      });
    });

    expect(postMock).toHaveBeenCalledTimes(2);
    const k1 = postMock.mock.calls[0][2]?.headers?.['Idempotency-Key'];
    const k2 = postMock.mock.calls[1][2]?.headers?.['Idempotency-Key'];
    expect(k1).toBeTruthy();
    expect(k2).toBeTruthy();
    expect(k1).not.toEqual(k2);
  });
});

describe('useCancelAppointment (P5-CU-3)', () => {
  it('mints a single-intent cancel session and reports auto-commit when the franchise allows it', async () => {
    postMock.mockResolvedValueOnce(
      makeEnvelope({ session: makeSession({ status: 'committed' }), auto_committed: true }) as never,
    );

    const { result } = renderHook(() => useCancelAppointment(), {
      wrapper: makeWrapper(),
    });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({
        appointmentId: 4321,
        body: { reason: 'Schedule conflict' },
      });
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toBe(ENDPOINTS.REORGANIZATIONS.CREATE);
    expect(body).toMatchObject({
      finalize_immediately: true,
      initial_intents: [
        {
          kind: 'cancel',
          appointment_id: 4321,
          cancellation_reason: 'Schedule conflict',
        },
      ],
    });
    expect(config?.headers?.['Idempotency-Key']).toEqual(expect.any(String));

    expect(returned).toMatchObject({
      appointmentId: 4321,
      status: 'cancelled',
      requiresApproval: false,
      sessionId: 42,
    });
  });

  it('flips requiresApproval=true when the cancel session lands in pending_review', async () => {
    postMock.mockResolvedValueOnce(
      makeEnvelope({
        session: makeSession({ status: 'pending_review', committed_at: null }),
        auto_committed: false,
      }) as never,
    );

    const { result } = renderHook(() => useCancelAppointment(), {
      wrapper: makeWrapper(),
    });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync({
        appointmentId: 4321,
        body: { reason: 'Cost concerns' },
      });
    });

    expect(returned).toMatchObject({
      appointmentId: 4321,
      status: 'pending_cancel',
      requiresApproval: true,
      sessionId: 42,
    });
  });

  it('propagates real network errors instead of silently optimistically resolving', async () => {
    postMock.mockRejectedValueOnce(new Error('Network unreachable'));

    const { result } = renderHook(() => useCancelAppointment(), {
      wrapper: makeWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        appointmentId: 4321,
        body: { reason: 'Other' },
      }),
    ).rejects.toThrow('Network unreachable');
  });
});

// P5-CU-4 — verify `useAppointments()` faithfully passes through the
// `pending_change` annotation that REMIBackend P6-BE-10 adds to each
// appointment row. The hook does not strip any fields, but if a future
// refactor maps the response shape this test catches the regression.
describe('useAppointments — pending_change pass-through (P5-CU-4 / P6-BE-10)', () => {
  // Re-import to avoid clashing with the mutation describe blocks above.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAppointments } = require('@/hooks/appointments/use-appointments');

  it('exposes appointment.pending_change on the data the hook returns', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        error: false,
        message: 'ok',
        data: [
          {
            id: 7,
            customer_id: 10,
            technician_id: 5,
            vehicle_id: 7,
            address_id: null,
            franchise_id: 1,
            status: 'confirmed',
            scheduled_date: '2026-04-15',
            scheduled_time: '14:00',
            notes: null,
            cancellation_reason: null,
            started_at: null,
            completed_at: null,
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
            // The annotation P6-BE-10 attaches.
            pending_change: {
              session_id: 77,
              source: 'tech_app',
              expires_at: null,
              intent: {
                id: 901,
                session_id: 77,
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
              },
            },
          },
        ],
      },
    } as never);

    const { result } = renderHook(() => useAppointments(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(result.current.data).toHaveLength(1);
    const [appt] = result.current.data!;
    expect(appt.id).toBe(7);
    expect(appt.pending_change).toMatchObject({
      session_id: 77,
      source: 'tech_app',
      intent: expect.objectContaining({
        intent_type: 'reschedule',
        payload: expect.objectContaining({ kind: 'reschedule' }),
      }),
    });
  });

  it('leaves pending_change undefined when the BE omits the annotation', async () => {
    getMock.mockResolvedValueOnce({
      data: {
        error: false,
        message: 'ok',
        data: [
          {
            id: 8,
            customer_id: 10,
            technician_id: 5,
            vehicle_id: 7,
            address_id: null,
            franchise_id: 1,
            status: 'confirmed',
            scheduled_date: '2026-04-16',
            scheduled_time: '09:00',
            notes: null,
            cancellation_reason: null,
            started_at: null,
            completed_at: null,
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
            // No pending_change — pre-P6-BE-10 server, or no active intent.
          },
        ],
      },
    } as never);

    const { result } = renderHook(() => useAppointments(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [appt] = result.current.data!;
    expect(appt.pending_change).toBeUndefined();
  });
});
