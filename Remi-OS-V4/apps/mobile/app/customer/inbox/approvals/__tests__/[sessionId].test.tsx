/**
 * P5-CU-5 — covers the per-session detail action sheet's render
 * branches, the three CTAs (each fires the right mutation), the
 * decline-route push (D.6 placeholder), the 422 inline-render path,
 * and the counter-propose modal flow.
 *
 * The hooks are mocked module-level so the test exercises the screen's
 * wiring without re-asserting the hooks' own URL / body contracts
 * (those live in `src/hooks/reorganizations/__tests__/use-session-detail.test.tsx`).
 */
/* eslint-disable import/first -- jest.mock must hoist above the imports
   that trigger them; placing them at the top of the file keeps the
   mocks active when the component-under-test imports the hooks. */
jest.mock('@/hooks/reorganizations/use-session-detail', () => ({
  useReorganizationSession: jest.fn(),
  useRespondToReorganizationSession: jest.fn(),
  useCounterProposeReorganizationSession: jest.fn(),
  extractLinterRejection: jest.requireActual(
    '@/hooks/reorganizations/use-session-detail',
  ).extractLinterRejection,
  reorganizationDetailKeys: jest.requireActual(
    '@/hooks/reorganizations/use-session-detail',
  ).reorganizationDetailKeys,
}));

jest.mock('@/hooks/appointments/use-appointments', () => ({
  useAppointments: jest.fn(),
}));

jest.mock('@/hooks/appointments/use-booking', () => ({
  useSuggestBooking: jest.fn(),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ApprovalSessionDetailScreen, {
  computeNewEndTime,
  describeIntentLong,
  summarizeLinterIssue,
} from '@customer/../app/inbox/approvals/[sessionId]';
import {
  useCounterProposeReorganizationSession,
  useReorganizationSession,
  useRespondToReorganizationSession,
} from '@customer/hooks/reorganizations/use-session-detail';
import { useAppointments } from '@customer/hooks/appointments/use-appointments';
import { useSuggestBooking } from '@customer/hooks/appointments/use-booking';
import type {
  CustomerVisibleIntent,
  CustomerVisibleSession,
} from '@customer/types/reorganization';
import type { Appointment } from '@customer/types/api';

const useDetailHook = useReorganizationSession as jest.MockedFunction<
  typeof useReorganizationSession
>;
const useRespondHook = useRespondToReorganizationSession as jest.MockedFunction<
  typeof useRespondToReorganizationSession
>;
const useCounterHook = useCounterProposeReorganizationSession as jest.MockedFunction<
  typeof useCounterProposeReorganizationSession
>;
const useAppointmentsHook = useAppointments as jest.MockedFunction<
  typeof useAppointments
>;
const useSuggestHook = useSuggestBooking as jest.MockedFunction<
  typeof useSuggestBooking
>;

// Type the mock results loosely — the screen only reads a handful of
// fields, the rest exist only so TS is happy at the cast site.
type DetailResult = ReturnType<typeof useReorganizationSession>;
type RespondResult = ReturnType<typeof useRespondToReorganizationSession>;
type CounterResult = ReturnType<typeof useCounterProposeReorganizationSession>;
type AppointmentsResult = ReturnType<typeof useAppointments>;
type SuggestResult = ReturnType<typeof useSuggestBooking>;

function makeDetail(
  data: CustomerVisibleSession | undefined,
  overrides: Partial<DetailResult> = {},
): DetailResult {
  return {
    data,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as DetailResult;
}

function makeRespond(overrides: Partial<RespondResult> = {}): RespondResult {
  return {
    mutate: jest.fn(),
    isPending: false,
    variables: undefined,
    ...overrides,
  } as unknown as RespondResult;
}

function makeCounter(overrides: Partial<CounterResult> = {}): CounterResult {
  return {
    mutate: jest.fn(),
    isPending: false,
    ...overrides,
  } as unknown as CounterResult;
}

function makeAppointments(
  data: Appointment[] = [],
): AppointmentsResult {
  return {
    data,
    isPending: false,
    isError: false,
  } as unknown as AppointmentsResult;
}

function makeSuggest(
  data: any[] | undefined,
  overrides: Partial<SuggestResult> = {},
): SuggestResult {
  return {
    data,
    mutate: jest.fn(),
    isPending: false,
    ...overrides,
  } as unknown as SuggestResult;
}

function makeRescheduleIntent(
  overrides: Partial<CustomerVisibleIntent> = {},
): CustomerVisibleIntent {
  return {
    id: 901,
    session_id: 42,
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
    session_id: 42,
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
    id: 42,
    source: 'tech_app',
    status: 'pending_review',
    intents: [makeRescheduleIntent()],
    expires_at: null,
    created_at: '2026-04-21T12:00:00.000Z',
    finalized_at: '2026-04-21T12:00:01.000Z',
    committed_at: null,
    cancelled_at: null,
    ...overrides,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 7,
    customer_id: 1,
    technician_id: 3,
    vehicle_id: 11,
    address_id: 4,
    franchise_id: 1,
    status: 'confirmed' as Appointment['status'],
    scheduled_date: '2026-04-25',
    scheduled_time: '09:00',
    notes: null,
    cancellation_reason: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z',
    services: [],
    ...overrides,
  } as Appointment;
}

beforeEach(() => {
  useDetailHook.mockReset();
  useRespondHook.mockReset();
  useCounterHook.mockReset();
  useAppointmentsHook.mockReset();
  useSuggestHook.mockReset();
  (useLocalSearchParams as jest.Mock).mockReset();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ sessionId: '42' });
  (router.push as jest.Mock).mockReset();
  (router.back as jest.Mock).mockReset();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  useAppointmentsHook.mockReturnValue(makeAppointments([makeAppointment()]));
  useSuggestHook.mockReturnValue(makeSuggest(undefined));
  useCounterHook.mockReturnValue(makeCounter());
});

describe('ApprovalSessionDetailScreen — render branches (P5-CU-5)', () => {
  it('renders a loader while the detail GET is pending', () => {
    useDetailHook.mockReturnValue(makeDetail(undefined, { isPending: true } as any));
    useRespondHook.mockReturnValue(makeRespond());
    render(<ApprovalSessionDetailScreen />);
    expect(screen.getByTestId('session-loader')).toBeOnTheScreen();
  });

  it('renders the error state on hook isError (not the empty state)', () => {
    // Customer-app override #5: a 404 / 5xx response must surface as an
    // error, not a silent empty state. The inbox-row tap that delivered
    // us here should not look the same as "session resolved" here.
    useDetailHook.mockReturnValue(
      makeDetail(undefined, { isError: true } as any),
    );
    useRespondHook.mockReturnValue(makeRespond());
    render(<ApprovalSessionDetailScreen />);
    expect(screen.getByText("Couldn't load this change")).toBeOnTheScreen();
  });

  it('renders the source badge + intent list for a populated session', () => {
    useDetailHook.mockReturnValue(
      makeDetail(makeSession({ source: 'franchise_dashboard' })),
    );
    useRespondHook.mockReturnValue(makeRespond());

    render(<ApprovalSessionDetailScreen />);
    expect(
      screen.getByTestId('session-source-badge-franchise_dashboard'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Franchise proposed')).toBeOnTheScreen();
    expect(screen.getByTestId('session-intent-list')).toBeOnTheScreen();
    expect(screen.getByTestId('session-intent-901')).toBeOnTheScreen();
    expect(screen.getByText(/Move to Wed, Apr 22 at 10:30 AM/)).toBeOnTheScreen();
  });

  it('closes via the close button (back stack present)', () => {
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond());
    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-close-button'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('Approve CTA (P5-CU-5)', () => {
  it('fires the respond mutation with action=approve when tapped', () => {
    const respondMutate = jest.fn();
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-approve-btn'));

    expect(respondMutate).toHaveBeenCalledTimes(1);
    expect(respondMutate.mock.calls[0][0]).toEqual({
      sessionId: 42,
      action: 'approve',
    });
  });

  it('closes the sheet on approve success', () => {
    const respondMutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-approve-btn'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('renders the linter rejection block when approve 422s', async () => {
    const issues = [{ message: 'Tech is double-booked at 10:30.' }];
    const axiosError: any = new Error('linter');
    axiosError.response = {
      status: 422,
      data: {
        message: 'linter_errors_block_finalize',
        data: { issues },
      },
    };
    const respondMutate = jest.fn((_vars, opts) => opts?.onError?.(axiosError));
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-approve-btn'));

    await waitFor(() =>
      expect(screen.getByTestId('session-linter-rejection')).toBeOnTheScreen(),
    );
    // The bullet prefix lives in the same <Text> node, so use a regex
    // matcher rather than the exact-string default.
    expect(screen.getByText(/Tech is double-booked at 10:30\./)).toBeOnTheScreen();
    // Sheet stays open so the user can decline / counter-propose instead.
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does NOT optimistically resolve on a generic network error (customer-app override #4)', () => {
    const respondMutate = jest.fn((_vars, opts) =>
      opts?.onError?.(new Error('Network down')),
    );
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond({ mutate: respondMutate } as any));

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-approve-btn'));

    // Sheet must stay open so the user sees the failure and can retry.
    expect(router.back).not.toHaveBeenCalled();
    // No linter block on a non-422 error — those go to a generic
    // Alert.alert which is platform-modal-y and we don't test it.
    expect(screen.queryByTestId('session-linter-rejection')).not.toBeOnTheScreen();
  });
});

describe('Decline CTA (P5-CU-5)', () => {
  it('navigates to the D.6 reason picker route on tap', () => {
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond());

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-decline-btn'));

    // D.6 / P5-CU-6 owns the picker; we only assert navigation here.
    expect(router.push).toHaveBeenCalledWith('/customer/inbox/approvals/42/decline');
  });
});

describe('Counter-propose CTA (P5-CU-5)', () => {
  it('opens the counter-propose modal when tapped', () => {
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond());
    useSuggestHook.mockReturnValue(
      makeSuggest([
        {
          technicianId: 3,
          technicianName: 'Alice',
          date: '2026-04-25',
          timeSlot: '14:00',
          insertionPosition: 0,
          score: 1,
          breakdown: {} as any,
          explanation: '',
          estimatedDriveMinutes: 10,
        },
      ]),
    );

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-counter-btn'));

    expect(screen.getByTestId('counter-submit-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('counter-slot-0')).toBeOnTheScreen();
  });

  it('is disabled when the session has only cancel intents (nothing to counter against)', () => {
    useDetailHook.mockReturnValue(
      makeDetail(makeSession({ intents: [makeCancelIntent()] })),
    );
    useRespondHook.mockReturnValue(makeRespond());

    render(<ApprovalSessionDetailScreen />);
    const btn = screen.getByTestId('session-counter-btn');
    expect(btn.props.accessibilityState?.disabled ?? btn.props.disabled).toBe(
      true,
    );
  });

  it('fires the counter-propose mutation with the picked slot as a reschedule intent', () => {
    const counterMutate = jest.fn();
    useDetailHook.mockReturnValue(makeDetail(makeSession()));
    useRespondHook.mockReturnValue(makeRespond());
    useCounterHook.mockReturnValue(makeCounter({ mutate: counterMutate } as any));
    useSuggestHook.mockReturnValue(
      makeSuggest([
        {
          technicianId: 3,
          technicianName: 'Alice',
          date: '2026-04-25',
          timeSlot: '14:00',
          insertionPosition: 0,
          score: 1,
          breakdown: {} as any,
          explanation: '',
          estimatedDriveMinutes: 10,
        },
      ]),
    );

    render(<ApprovalSessionDetailScreen />);
    fireEvent.press(screen.getByTestId('session-counter-btn'));
    fireEvent.press(screen.getByTestId('counter-slot-0'));
    fireEvent.press(screen.getByTestId('counter-submit-btn'));

    expect(counterMutate).toHaveBeenCalledTimes(1);
    expect(counterMutate.mock.calls[0][0]).toEqual({
      sessionId: 42,
      initialIntents: [
        {
          kind: 'reschedule',
          appointment_id: 7,
          new_scheduled_date: '2026-04-25',
          new_start_time: '14:00',
          new_end_time: '15:00',
          new_technician_id: 3,
        },
      ],
    });
  });
});

describe('describeIntentLong (P5-CU-5)', () => {
  it('describes a reschedule with a new tech', () => {
    const intent = makeRescheduleIntent({
      payload: {
        kind: 'reschedule',
        appointment_id: 7,
        new_scheduled_date: '2026-04-22',
        new_start_time: '10:30',
        new_end_time: '11:30',
        new_technician_id: 99,
      },
    });
    expect(describeIntentLong(intent, null)).toBe(
      'Move to Wed, Apr 22 at 10:30 AM with a new technician.',
    );
  });

  it('describes a cancel intent referencing the appointment date when present', () => {
    expect(
      describeIntentLong(makeCancelIntent(), makeAppointment()),
    ).toContain('Cancel your Sat, Apr 25 appointment');
  });
});

describe('summarizeLinterIssue (P5-CU-5)', () => {
  it('extracts the message field when present', () => {
    expect(summarizeLinterIssue({ message: 'Conflict detected.' })).toBe(
      'Conflict detected.',
    );
  });

  it('falls back to a generic label when the issue shape is unrecognized', () => {
    expect(summarizeLinterIssue({ unknown: 'x' })).toBe(
      'A scheduling conflict was detected.',
    );
    expect(summarizeLinterIssue(null)).toBe(
      'A scheduling conflict was detected.',
    );
  });
});

describe('computeNewEndTime (P5-CU-5)', () => {
  it('defaults to 60 minutes when the appointment carries no service durations', () => {
    expect(computeNewEndTime('14:00', null)).toBe('15:00');
  });

  it('sums service durations to derive the end-time', () => {
    const appointment = makeAppointment({
      services: [
        { id: 1, appointment_id: 7, service_id: 1, price: 0 as any, quantity: 1, status: 'pending' as any, started_at: null, completed_at: null, created_at: '', service: { id: 1, name: '', description: null, base_price: 0 as any, duration_minutes: 30, is_active: true, category: null, health_component: null, created_at: '', updated_at: '' } } as any,
        { id: 2, appointment_id: 7, service_id: 2, price: 0 as any, quantity: 1, status: 'pending' as any, started_at: null, completed_at: null, created_at: '', service: { id: 2, name: '', description: null, base_price: 0 as any, duration_minutes: 45, is_active: true, category: null, health_component: null, created_at: '', updated_at: '' } } as any,
      ],
    });
    expect(computeNewEndTime('14:00', appointment)).toBe('15:15');
  });

  it('wraps cleanly past midnight (defensive — slot times are normally daytime)', () => {
    expect(computeNewEndTime('23:30', null)).toBe('00:30');
  });
});
