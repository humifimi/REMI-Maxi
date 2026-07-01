/**
 * P5-CU-7 — Covers the multi-reschedule screen's chunk-prompt test
 * obligations:
 *
 *   1. Multi-select state updates (toggle on / off; count reflected in
 *      the primary CTA).
 *   2. Shared vs per-row mode produces the right intent payloads on
 *      submit.
 *   3. 422 linter rejection surfaces per-row errors keyed by
 *      affected appointment_id.
 *
 * We mock both `useAppointments` (so the list is deterministic) and
 * `useCreateReorganizationSession` (so we can assert the mint call's
 * arguments and simulate the linter-rejection branch without network).
 */
/* eslint-disable import/first -- jest.mock hoisting means mocks must
   be declared before the imports they intercept. */
jest.mock('@/hooks/appointments/use-appointments', () => ({
  useAppointments: jest.fn(),
}));
jest.mock('@/hooks/reorganizations/use-create-session', () => {
  const actual = jest.requireActual(
    '@/hooks/reorganizations/use-create-session',
  );
  return {
    ...actual,
    useCreateReorganizationSession: jest.fn(),
  };
});

import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import MultiRescheduleScreen, {
  filterUpcomingForMultiReschedule,
  formatVehicleSummary,
  multiRescheduleFormSchema,
} from '@customer/../app/schedule/multi-reschedule';
import { useAppointments } from '@customer/hooks/appointments/use-appointments';
import { useCreateReorganizationSession } from '@customer/hooks/reorganizations/use-create-session';
import type { Appointment } from '@customer/types/api';

const useAppointmentsMock = useAppointments as jest.MockedFunction<
  typeof useAppointments
>;
const useCreateMock = useCreateReorganizationSession as jest.MockedFunction<
  typeof useCreateReorganizationSession
>;

type CreateHookReturn = ReturnType<typeof useCreateReorganizationSession>;

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
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
    notes: null,
    cancellation_reason: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-04-20T00:00:00.000Z',
    updated_at: '2026-04-20T00:00:00.000Z',
    vehicle: {
      id: 1,
      user_id: 1,
      vin: null,
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      engine: null,
      license_plate: null,
      license_plate_state: null,
      color: null,
      mileage: null,
      created_at: '2026-04-20T00:00:00.000Z',
      updated_at: '2026-04-20T00:00:00.000Z',
    },
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

function makeAppointmentsHookResult(
  appointments: Appointment[] | null,
  overrides: Partial<ReturnType<typeof useAppointments>> = {},
): ReturnType<typeof useAppointments> {
  return {
    data: appointments,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAppointments>;
}

function makeCreateMock(
  overrides: Partial<CreateHookReturn> = {},
): CreateHookReturn {
  return {
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    variables: undefined,
    ...overrides,
  } as unknown as CreateHookReturn;
}

beforeEach(() => {
  useAppointmentsMock.mockReset();
  useCreateMock.mockReset();
  (router.push as jest.Mock).mockReset();
  (router.back as jest.Mock).mockReset();
  (router.replace as jest.Mock).mockReset();
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('filterUpcomingForMultiReschedule', () => {
  it('excludes completed / paid / cancelled / created statuses', () => {
    const appts: Appointment[] = [
      makeAppointment({ id: 1, status: 'confirmed', scheduled_date: '2026-05-10', scheduled_time: '09:00' }),
      makeAppointment({ id: 2, status: 'completed', scheduled_date: '2026-04-10', scheduled_time: '09:00' }),
      makeAppointment({ id: 3, status: 'paid', scheduled_date: '2026-04-11', scheduled_time: '09:00' }),
      makeAppointment({ id: 4, status: 'cancelled', scheduled_date: '2026-04-12', scheduled_time: '09:00' }),
      makeAppointment({ id: 5, status: 'created', scheduled_date: '2026-05-15', scheduled_time: '09:00' }),
      makeAppointment({ id: 6, status: 'en_route', scheduled_date: '2026-05-03', scheduled_time: '09:00' }),
    ];
    const filtered = filterUpcomingForMultiReschedule(appts);
    expect(filtered.map((a) => a.id)).toEqual([6, 1]); // sorted by scheduled_date asc
  });

  it('drops unscheduled rows (scheduled_date / scheduled_time null)', () => {
    const appts: Appointment[] = [
      makeAppointment({ id: 1, scheduled_date: null }),
      makeAppointment({ id: 2, scheduled_time: null }),
      makeAppointment({ id: 3 }),
    ];
    expect(filterUpcomingForMultiReschedule(appts).map((a) => a.id)).toEqual([3]);
  });

  it('returns [] for undefined / null input (error state)', () => {
    expect(filterUpcomingForMultiReschedule(undefined)).toEqual([]);
    expect(filterUpcomingForMultiReschedule(null)).toEqual([]);
  });
});

describe('formatVehicleSummary', () => {
  it('renders year + make + model when available', () => {
    expect(formatVehicleSummary(makeAppointment())).toBe('2020 Honda Civic');
  });

  it('falls back to "Appointment #N" when the vehicle relation is missing', () => {
    const appt = makeAppointment({ id: 42, vehicle: undefined });
    expect(formatVehicleSummary(appt)).toBe('Appointment #42');
  });
});

describe('multiRescheduleFormSchema', () => {
  it('rejects a submission with no appointments selected', () => {
    const res = multiRescheduleFormSchema.safeParse({
      mode: 'shared',
      selected: [],
      shared: { date: '2026-05-12', time: '14:00' },
      perRow: {},
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.includes('selected'))).toBe(true);
    }
  });

  it('rejects a shared-mode submission with an invalid date', () => {
    const res = multiRescheduleFormSchema.safeParse({
      mode: 'shared',
      selected: [10],
      shared: { date: '2026-5-12', time: '14:00' },
      perRow: {},
    });
    expect(res.success).toBe(false);
  });

  it('rejects a per_row submission where a selected row is missing its date', () => {
    const res = multiRescheduleFormSchema.safeParse({
      mode: 'per_row',
      selected: [10, 11],
      shared: { date: '', time: '' },
      perRow: {
        '10': { date: '2026-05-12', time: '14:00' },
      },
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('perRow.11.date');
      expect(paths).toContain('perRow.11.time');
    }
  });

  it('accepts a valid shared-mode submission', () => {
    const res = multiRescheduleFormSchema.safeParse({
      mode: 'shared',
      selected: [10, 11],
      shared: { date: '2026-05-12', time: '14:00' },
      perRow: {},
    });
    expect(res.success).toBe(true);
  });

  it('accepts a valid per_row submission', () => {
    const res = multiRescheduleFormSchema.safeParse({
      mode: 'per_row',
      selected: [10, 11],
      shared: { date: '', time: '' },
      perRow: {
        '10': { date: '2026-05-12', time: '14:00' },
        '11': { date: '2026-05-13', time: '15:00' },
      },
    });
    expect(res.success).toBe(true);
  });
});

describe('MultiRescheduleScreen — loading / error / too-few render branches', () => {
  it('renders a loader while appointments are loading', () => {
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult(null, { isPending: true }),
    );
    useCreateMock.mockReturnValue(makeCreateMock());
    render(<MultiRescheduleScreen />);
    expect(screen.getByTestId('multi-reschedule-loader')).toBeOnTheScreen();
  });

  it('renders an error state (NOT the empty state) when the appointments hook errors', () => {
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult([], { isError: true }),
    );
    useCreateMock.mockReturnValue(makeCreateMock());
    render(<MultiRescheduleScreen />);
    expect(screen.getByText("Couldn't load your appointments")).toBeOnTheScreen();
  });

  it('renders the "need ≥2 appointments" empty state when only one is upcoming', () => {
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult([makeAppointment({ id: 1 })]),
    );
    useCreateMock.mockReturnValue(makeCreateMock());
    render(<MultiRescheduleScreen />);
    expect(
      screen.getByText('Not enough upcoming appointments'),
    ).toBeOnTheScreen();
  });
});

describe('MultiRescheduleScreen — multi-select state (P5-CU-7)', () => {
  beforeEach(() => {
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult([
        makeAppointment({ id: 10, scheduled_date: '2026-05-10', scheduled_time: '09:00' }),
        makeAppointment({ id: 11, scheduled_date: '2026-05-12', scheduled_time: '13:00' }),
        makeAppointment({ id: 12, scheduled_date: '2026-05-14', scheduled_time: '10:00' }),
      ]),
    );
    useCreateMock.mockReturnValue(makeCreateMock());
  });

  it('starts with every row unchecked and the submit CTA showing "(0)"', () => {
    render(<MultiRescheduleScreen />);
    expect(screen.getByTestId('multi-reschedule-row-10')).toBeOnTheScreen();
    expect(screen.getByText('Continue (0)')).toBeOnTheScreen();
  });

  it('toggles selection on + off and updates the CTA count', () => {
    render(<MultiRescheduleScreen />);

    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    expect(screen.getByText('Continue (1)')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    expect(screen.getByText('Continue (2)')).toBeOnTheScreen();

    // Toggle the first one off
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    expect(screen.getByText('Continue (1)')).toBeOnTheScreen();
  });
});

describe('MultiRescheduleScreen — shared-mode submit (P5-CU-7)', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult([
        makeAppointment({ id: 10, scheduled_date: '2026-05-10', scheduled_time: '09:00' }),
        makeAppointment({ id: 11, scheduled_date: '2026-05-12', scheduled_time: '13:00' }),
      ]),
    );
    useCreateMock.mockReturnValue(
      makeCreateMock({ mutate: mutate as unknown as CreateHookReturn['mutate'] }),
    );
  });

  it('sends one intent per selected appointment with the shared date/time', async () => {
    render(<MultiRescheduleScreen />);

    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );

    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const [variables] = mutate.mock.calls[0];
    expect(variables.intents).toHaveLength(2);
    expect(variables.intents[0]).toMatchObject({
      kind: 'reschedule',
      appointment_id: 10,
      new_scheduled_date: '2026-05-20',
      new_start_time: '14:00',
    });
    expect(variables.intents[1]).toMatchObject({
      kind: 'reschedule',
      appointment_id: 11,
      new_scheduled_date: '2026-05-20',
      new_start_time: '14:00',
    });
  });

  it('does not submit when no appointments are selected (Zod rejects min(1))', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));
    // Give RHF's async validation a microtask to run.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('MultiRescheduleScreen — per-row-mode submit (P5-CU-7)', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult([
        makeAppointment({ id: 10, scheduled_date: '2026-05-10', scheduled_time: '09:00' }),
        makeAppointment({ id: 11, scheduled_date: '2026-05-12', scheduled_time: '13:00' }),
      ]),
    );
    useCreateMock.mockReturnValue(
      makeCreateMock({ mutate: mutate as unknown as CreateHookReturn['mutate'] }),
    );
  });

  it('sends per-row intents with each row\'s own date/time', async () => {
    render(<MultiRescheduleScreen />);

    // Select both, then switch to per-row mode so rows seed their own
    // inputs from the appointment's existing schedule.
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.press(screen.getByTestId('multi-reschedule-mode-per-row'));

    // Override row 10; leave row 11 with its seeded (original) values.
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-row-date-10'),
      '2026-05-25',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-row-time-10'),
      '08:00',
    );

    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const [variables] = mutate.mock.calls[0];
    expect(variables.intents).toHaveLength(2);
    expect(variables.intents[0]).toMatchObject({
      kind: 'reschedule',
      appointment_id: 10,
      new_scheduled_date: '2026-05-25',
      new_start_time: '08:00',
    });
    expect(variables.intents[1]).toMatchObject({
      kind: 'reschedule',
      appointment_id: 11,
      new_scheduled_date: '2026-05-12',
      new_start_time: '13:00',
    });
  });

  it('switching mode back to shared does not throw away per-row entries (they stay in state)', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.press(screen.getByTestId('multi-reschedule-mode-per-row'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-row-date-10'),
      '2026-05-25',
    );

    fireEvent.press(screen.getByTestId('multi-reschedule-mode-shared'));
    // Now submit via shared
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-26',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '09:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [variables] = mutate.mock.calls[0];
    expect(variables.intents.every((i: { new_scheduled_date: string }) =>
      i.new_scheduled_date === '2026-05-26',
    )).toBe(true);
  });
});

describe('MultiRescheduleScreen — response branches (P5-CU-7)', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    useAppointmentsMock.mockReturnValue(
      makeAppointmentsHookResult([
        makeAppointment({ id: 10, scheduled_date: '2026-05-10', scheduled_time: '09:00' }),
        makeAppointment({ id: 11, scheduled_date: '2026-05-12', scheduled_time: '13:00' }),
      ]),
    );
    useCreateMock.mockReturnValue(
      makeCreateMock({ mutate: mutate as unknown as CreateHookReturn['mutate'] }),
    );
  });

  it('shows "Submitted for franchise review" on the pending-review branch (autoCommitted=false — common case per §2.5)', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [, options] = mutate.mock.calls[0];
    act(() => {
      options.onSuccess({
        autoCommitted: false,
        session: {
          id: 777,
          source: 'customer_app',
          status: 'pending_review',
          intents: [],
          expires_at: null,
          created_at: '2026-05-02T12:00:00.000Z',
          finalized_at: '2026-05-02T12:00:01.000Z',
          committed_at: null,
          cancelled_at: null,
        },
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Submitted for franchise review',
      expect.stringContaining("We've sent your requested changes"),
      expect.any(Array),
    );
  });

  it('shows "Scheduled" on the auto-commit branch (rare; requires policy override per §2.5)', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [, options] = mutate.mock.calls[0];
    act(() => {
      options.onSuccess({
        autoCommitted: true,
        session: {
          id: 777,
          source: 'customer_app',
          status: 'committed',
          intents: [],
          expires_at: null,
          created_at: '2026-05-02T12:00:00.000Z',
          finalized_at: '2026-05-02T12:00:01.000Z',
          committed_at: '2026-05-02T12:00:02.000Z',
          cancelled_at: null,
        },
      });
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Scheduled',
      expect.stringContaining('appointments have been updated'),
      expect.any(Array),
    );
  });

  it('surfaces 422 linter errors inline, bucketed per row', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    // The screen hands us `mutate(variables, options)`; we fire
    // the onError callback with a 422 Axios-shaped error.
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [, options] = mutate.mock.calls[0];
    const axiosError: any = new Error('linter');
    axiosError.response = {
      status: 422,
      data: {
        error: true,
        message: 'linter_errors_block_finalize',
        data: {
          issues: [
            {
              severity: 'error',
              kind: 'customer_sla_violation',
              affectedAppointmentIds: [10],
              humanMessage:
                'This appointment is inside your 24-hour no-reschedule window.',
            },
            {
              severity: 'error',
              kind: 'time_conflict',
              affectedAppointmentIds: [11],
              humanMessage: 'Tech is already booked at 14:00 on 2026-05-20.',
            },
          ],
        },
      },
    };
    act(() => {
      options.onError(axiosError);
    });

    expect(
      screen.getByTestId('multi-reschedule-row-linter-10'),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('multi-reschedule-row-linter-11'),
    ).toBeOnTheScreen();
    // Rendered as `• {humanMessage}` — two text nodes inside one <Text>,
    // so `getByText(exactString)` doesn't match. Use a regex instead.
    expect(
      screen.getByText(
        /This appointment is inside your 24-hour no-reschedule window\./,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Tech is already booked at 14:00 on 2026-05-20\./),
    ).toBeOnTheScreen();
  });

  it('renders a generic error block for non-422 errors (no offline queue per override #4)', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [, options] = mutate.mock.calls[0];
    act(() => {
      options.onError(new Error('Network down'));
    });

    expect(
      screen.getByTestId('multi-reschedule-generic-error'),
    ).toBeOnTheScreen();
  });

  it('toggling a row off clears previously-displayed linter errors (user can adjust and resubmit)', async () => {
    render(<MultiRescheduleScreen />);
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-11'));
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-date'),
      '2026-05-20',
    );
    fireEvent.changeText(
      screen.getByTestId('multi-reschedule-shared-time'),
      '14:00',
    );
    fireEvent.press(screen.getByTestId('multi-reschedule-submit-btn'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [, options] = mutate.mock.calls[0];
    const axiosError: any = new Error('linter');
    axiosError.response = {
      status: 422,
      data: {
        error: true,
        message: 'linter_errors_block_finalize',
        data: {
          issues: [
            {
              severity: 'error',
              kind: 'customer_sla_violation',
              affectedAppointmentIds: [10],
              humanMessage: 'Too close to the scheduled time.',
            },
          ],
        },
      },
    };
    act(() => {
      options.onError(axiosError);
    });
    expect(
      screen.getByTestId('multi-reschedule-row-linter-10'),
    ).toBeOnTheScreen();

    // Deselect row 10 → linter surface is reset so the user can try again.
    fireEvent.press(screen.getByTestId('multi-reschedule-toggle-10'));
    expect(
      screen.queryByTestId('multi-reschedule-row-linter-10'),
    ).not.toBeOnTheScreen();
  });
});
