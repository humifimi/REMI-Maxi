/**
 * P5-CU-7 — verifies the multi-intent mint hook hits the right URL,
 * attaches an `Idempotency-Key` header, discriminates the
 * auto-committed vs pending-review branches via `auto_committed`
 * (NOT HTTP status code — see PLAN-DEVIATION
 * 2026-05-02-customer-mint-response-status-codes), and surfaces a
 * 422 linter rejection in a shape the screen can bucket by
 * appointment_id.
 *
 * The screen's wiring of those branches is covered in
 * `app/schedule/__tests__/multi-reschedule.test.tsx`.
 */
import { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';

import apiClient from '@customer/api/client';
import {
  addMinutesToTimeOfDay,
  bucketLinterIssuesByAppointment,
  buildRescheduleIntent,
  summarizeLinterIssue,
  totalServiceMinutes,
  useCreateReorganizationSession,
} from '@customer/hooks/reorganizations/use-create-session';
import { extractLinterRejection } from '@customer/hooks/reorganizations/use-session-detail';
import type { Appointment } from '@customer/types/api';
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
    id: 501,
    source: 'customer_app',
    status: 'pending_review',
    intents: [],
    expires_at: null,
    created_at: '2026-05-02T12:00:00.000Z',
    finalized_at: '2026-05-02T12:00:01.000Z',
    committed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function makeAppointment(
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id: 10,
    customer_id: 1,
    vehicle_id: 1,
    franchise_id: 1,
    address_id: 1,
    technician_id: 2,
    status: 'confirmed',
    scheduled_date: '2026-05-10',
    scheduled_time: '09:00',
    created_at: '2026-04-20T00:00:00.000Z',
    services: [
      {
        id: 1,
        appointment_id: 10,
        service_id: 1,
        price: 100,
        quantity: 1,
        status: 'pending',
        started_at: null,
        completed_at: null,
        created_at: '2026-04-20T00:00:00.000Z',
        service: {
          id: 1,
          name: 'Oil change',
          duration_minutes: 45,
          base_price: 100,
        },
      },
    ],
    ...overrides,
  } as Appointment;
}

beforeEach(() => {
  postMock.mockReset();
});

describe('addMinutesToTimeOfDay', () => {
  it('adds minutes within the day without wrap', () => {
    expect(addMinutesToTimeOfDay('09:00', 45)).toBe('09:45');
    expect(addMinutesToTimeOfDay('09:30', 90)).toBe('11:00');
  });

  it('wraps past midnight using mod 24h arithmetic', () => {
    // 23:30 + 60 min → 00:30 next day (wrap)
    expect(addMinutesToTimeOfDay('23:30', 60)).toBe('00:30');
  });

  it('zero-pads both hours and minutes', () => {
    expect(addMinutesToTimeOfDay('07:05', 5)).toBe('07:10');
    expect(addMinutesToTimeOfDay('07:00', 60)).toBe('08:00');
  });
});

describe('totalServiceMinutes', () => {
  it('sums duration_minutes across services on the appointment', () => {
    const appt = makeAppointment({
      services: [
        {
          id: 1,
          appointment_id: 10,
          service_id: 1,
          price: 100,
          quantity: 1,
          status: 'pending',
          started_at: null,
          completed_at: null,
          created_at: '2026-04-20T00:00:00.000Z',
          service: {
            id: 1,
            name: 'Oil change',
            duration_minutes: 45,
            base_price: 100,
          },
        },
        {
          id: 2,
          appointment_id: 10,
          service_id: 2,
          price: 50,
          quantity: 1,
          status: 'pending',
          started_at: null,
          completed_at: null,
          created_at: '2026-04-20T00:00:00.000Z',
          service: {
            id: 2,
            name: 'Tire rotation',
            duration_minutes: 30,
            base_price: 50,
          },
        },
      ],
    } as Partial<Appointment>);
    expect(totalServiceMinutes(appt)).toBe(75);
  });

  it('falls back to 60 min when no services are present', () => {
    expect(totalServiceMinutes(makeAppointment({ services: [] }))).toBe(60);
  });

  it('falls back to 60 min when services lack duration_minutes', () => {
    const appt = makeAppointment({
      services: [
        {
          id: 1,
          appointment_id: 10,
          service_id: 1,
          price: 0,
          quantity: 1,
          status: 'pending',
          started_at: null,
          completed_at: null,
          created_at: '2026-04-20T00:00:00.000Z',
          // No `service` relation — no duration available.
        },
      ],
    } as Partial<Appointment>);
    expect(totalServiceMinutes(appt)).toBe(60);
  });
});

describe('buildRescheduleIntent', () => {
  it('derives new_end_time from the picked start + service durations', () => {
    const appt = makeAppointment(); // 45-minute service
    const intent = buildRescheduleIntent(appt, '2026-05-12', '14:00');
    expect(intent).toEqual({
      kind: 'reschedule',
      appointment_id: 10,
      new_scheduled_date: '2026-05-12',
      new_start_time: '14:00',
      new_end_time: '14:45',
    });
  });

  it('includes new_technician_id when provided', () => {
    const appt = makeAppointment();
    const intent = buildRescheduleIntent(appt, '2026-05-12', '14:00', 99);
    expect(intent.new_technician_id).toBe(99);
  });

  it('omits new_technician_id when not provided', () => {
    const appt = makeAppointment();
    const intent = buildRescheduleIntent(appt, '2026-05-12', '14:00');
    expect('new_technician_id' in intent).toBe(false);
  });
});

describe('useCreateReorganizationSession — success branches (P5-CU-7)', () => {
  it('POSTs /reorganizations with the N intents and an Idempotency-Key', async () => {
    postMock.mockResolvedValueOnce(
      envelope({
        session: makeSession({ id: 501, status: 'pending_review' }),
        auto_committed: false,
      }) as never,
    );

    const intents: ReschedulePayload[] = [
      {
        kind: 'reschedule',
        appointment_id: 10,
        new_scheduled_date: '2026-05-12',
        new_start_time: '14:00',
        new_end_time: '14:45',
      },
      {
        kind: 'reschedule',
        appointment_id: 11,
        new_scheduled_date: '2026-05-12',
        new_start_time: '15:00',
        new_end_time: '16:00',
      },
    ];

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ intents });
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toBe('/reorganizations');
    expect(body).toEqual({
      initial_intents: intents,
      finalize_immediately: true,
    });
    expect(config?.headers?.['Idempotency-Key']).toEqual(
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/),
    );
  });

  // PLAN-DEVIATION: 2026-05-02-customer-mint-response-status-codes — the
  // chunk-prompt's "200 → auto-commit" vs "202 → pending_review"
  // discrimination is not how the BE talks. Axios resolves both as the
  // same success promise (HTTP 201); the hook looks at
  // `response.body.data.auto_committed`. These two tests lock that
  // behaviour so a future agent can't "fix" the hook to check status
  // codes.
  it('returns autoCommitted=false when the BE response says so (common case: customer_authored_multi → fo_review per §2.5)', async () => {
    postMock.mockResolvedValueOnce(
      envelope({
        session: makeSession({ id: 501, status: 'pending_review' }),
        auto_committed: false,
      }) as never,
    );

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let out;
    await act(async () => {
      out = await result.current.mutateAsync({
        intents: [
          {
            kind: 'reschedule',
            appointment_id: 10,
            new_scheduled_date: '2026-05-12',
            new_start_time: '14:00',
            new_end_time: '14:45',
          },
        ],
      });
    });

    expect(out).toMatchObject({
      autoCommitted: false,
      session: { id: 501, status: 'pending_review' },
    });
  });

  it('returns autoCommitted=true when the policy short-circuits to auto', async () => {
    postMock.mockResolvedValueOnce(
      envelope({
        session: makeSession({ id: 501, status: 'committed' }),
        auto_committed: true,
      }) as never,
    );

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let out;
    await act(async () => {
      out = await result.current.mutateAsync({
        intents: [
          {
            kind: 'reschedule',
            appointment_id: 10,
            new_scheduled_date: '2026-05-12',
            new_start_time: '14:00',
            new_end_time: '14:45',
          },
        ],
      });
    });

    expect(out).toMatchObject({
      autoCommitted: true,
      session: { id: 501, status: 'committed' },
    });
  });

  it('normalizes the bare-CustomerVisibleSession response shape (no `session` envelope)', async () => {
    // The BE's draft branch returns <CustomerVisibleSession> directly.
    // We always send finalize_immediately=true so this shouldn't fire
    // in production, but the normalizer handles it defensively.
    postMock.mockResolvedValueOnce(
      envelope(makeSession({ id: 501, status: 'pending_review' })) as never,
    );

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let out;
    await act(async () => {
      out = await result.current.mutateAsync({
        intents: [
          {
            kind: 'reschedule',
            appointment_id: 10,
            new_scheduled_date: '2026-05-12',
            new_start_time: '14:00',
            new_end_time: '14:45',
          },
        ],
      });
    });

    expect(out).toMatchObject({
      autoCommitted: false,
      session: { id: 501, status: 'pending_review' },
    });
  });

  it('passes notes through to the body when provided', async () => {
    postMock.mockResolvedValueOnce(
      envelope({
        session: makeSession({ id: 501 }),
        auto_committed: false,
      }) as never,
    );

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        intents: [
          {
            kind: 'reschedule',
            appointment_id: 10,
            new_scheduled_date: '2026-05-12',
            new_start_time: '14:00',
            new_end_time: '14:45',
          },
        ],
        notes: 'Shifting everything two weeks out for an audit.',
      });
    });

    const [, body] = postMock.mock.calls[0];
    expect(body).toMatchObject({
      notes: 'Shifting everything two weeks out for an audit.',
    });
  });
});

describe('useCreateReorganizationSession — 422 linter rejection (P5-CU-7)', () => {
  it('surfaces a 422 linter rejection verbatim so the screen can bucket it per row', async () => {
    const issues = [
      {
        severity: 'error',
        kind: 'customer_sla_violation',
        affectedAppointmentIds: [10],
        humanMessage:
          "Appointment 10 is inside the customer's 24-hour no-reschedule SLA window.",
      },
      {
        severity: 'error',
        kind: 'time_conflict',
        affectedAppointmentIds: [11, 12],
        humanMessage:
          'Two appointments landed in the same tech slot at 14:00.',
      },
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

    const { result } = renderHook(() => useCreateReorganizationSession(), {
      wrapper: makeWrapper(),
    });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          intents: [
            {
              kind: 'reschedule',
              appointment_id: 10,
              new_scheduled_date: '2026-05-12',
              new_start_time: '14:00',
              new_end_time: '14:45',
            },
          ],
        });
      } catch (e) {
        caught = e;
      }
    });

    const rejection = extractLinterRejection(caught);
    expect(rejection?.issues).toEqual(issues);
  });
});

describe('summarizeLinterIssue', () => {
  it('extracts the humanMessage field (canonical BE shape)', () => {
    const summary = summarizeLinterIssue({
      severity: 'error',
      kind: 'time_conflict',
      affectedAppointmentIds: [42],
      humanMessage: 'Tech is double-booked.',
    });
    expect(summary).toEqual({
      humanMessage: 'Tech is double-booked.',
      affectedAppointmentIds: [42],
      severity: 'error',
      kind: 'time_conflict',
    });
  });

  it('falls back to `message` when humanMessage is absent', () => {
    const summary = summarizeLinterIssue({
      severity: 'error',
      affectedAppointmentIds: [42],
      message: 'Legacy wire shape.',
    });
    expect(summary?.humanMessage).toBe('Legacy wire shape.');
  });

  it('accepts snake_case affected_appointment_ids for forward-compat', () => {
    const summary = summarizeLinterIssue({
      humanMessage: 'snake_case path.',
      affected_appointment_ids: [7, 8],
    });
    expect(summary?.affectedAppointmentIds).toEqual([7, 8]);
  });

  it('returns null when the shape is unrecognized', () => {
    expect(summarizeLinterIssue(null)).toBeNull();
    expect(summarizeLinterIssue('plain string')).toBeNull();
    expect(summarizeLinterIssue({})).toBeNull();
    expect(summarizeLinterIssue({ humanMessage: '' })).toBeNull();
  });
});

describe('bucketLinterIssuesByAppointment', () => {
  it('buckets issues by affected appointment_id', () => {
    const buckets = bucketLinterIssuesByAppointment([
      {
        severity: 'error',
        kind: 'customer_sla_violation',
        affectedAppointmentIds: [10],
        humanMessage: 'Inside SLA window.',
      },
      {
        severity: 'error',
        kind: 'time_conflict',
        affectedAppointmentIds: [11],
        humanMessage: 'Tech double-booked at 14:00.',
      },
    ]);
    expect(buckets.byAppointmentId.get(10)?.[0].humanMessage).toBe(
      'Inside SLA window.',
    );
    expect(buckets.byAppointmentId.get(11)?.[0].humanMessage).toBe(
      'Tech double-booked at 14:00.',
    );
    expect(buckets.unassigned).toHaveLength(0);
  });

  it('duplicates issues that affect multiple appointments into each bucket', () => {
    const buckets = bucketLinterIssuesByAppointment([
      {
        severity: 'error',
        kind: 'time_conflict',
        affectedAppointmentIds: [10, 11],
        humanMessage: 'Collision between 10 and 11.',
      },
    ]);
    expect(buckets.byAppointmentId.get(10)?.[0].humanMessage).toBe(
      'Collision between 10 and 11.',
    );
    expect(buckets.byAppointmentId.get(11)?.[0].humanMessage).toBe(
      'Collision between 10 and 11.',
    );
  });

  it('routes issues with no affectedAppointmentIds into unassigned', () => {
    const buckets = bucketLinterIssuesByAppointment([
      {
        severity: 'error',
        affectedAppointmentIds: [],
        humanMessage: 'Session-wide failure.',
      },
    ]);
    expect(buckets.byAppointmentId.size).toBe(0);
    expect(buckets.unassigned[0].humanMessage).toBe('Session-wide failure.');
  });

  it('skips unrecognized issues (keeps the per-row surface clean)', () => {
    const buckets = bucketLinterIssuesByAppointment([
      null,
      'just a string',
      {},
      {
        humanMessage: 'A real issue.',
        affectedAppointmentIds: [42],
      },
    ]);
    expect(buckets.byAppointmentId.size).toBe(1);
    expect(buckets.byAppointmentId.get(42)?.[0].humanMessage).toBe(
      'A real issue.',
    );
  });
});
