import { fireEvent, render, screen } from '@testing-library/react-native';
import { AppointmentCard } from '@customer/components/appointment/appointment-card';
import { AppointmentStatus } from '@customer/types/enums';
import type { Appointment } from '@customer/types/api';
import type {
  AppointmentPendingChangeSummary,
  CustomerVisibleIntent,
  ReorganizationSessionSource,
} from '@customer/types/reorganization';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 1,
    customer_id: 10,
    technician_id: 5,
    vehicle_id: 7,
    address_id: null,
    franchise_id: 1,
    status: AppointmentStatus.CONFIRMED,
    scheduled_date: '2026-04-15',
    scheduled_time: '14:00',
    notes: null,
    cancellation_reason: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    vehicle: {
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      nickname: null,
    } as Appointment['vehicle'],
    technician: { id: 5, full_name: 'Sam Tech', phone: null },
    services: [
      {
        id: 1,
        appointment_id: 1,
        service_id: 100,
        price: 89,
        quantity: 1,
        status: 'pending',
        started_at: null,
        completed_at: null,
        created_at: '2026-04-01T00:00:00.000Z',
        service: { name: 'Oil Change' } as never,
      },
      {
        id: 2,
        appointment_id: 1,
        service_id: 101,
        price: 25,
        quantity: 1,
        status: 'pending',
        started_at: null,
        completed_at: null,
        created_at: '2026-04-01T00:00:00.000Z',
        service: { name: 'Tire Rotation' } as never,
      },
    ],
    ...overrides,
  };
}

describe('AppointmentCard', () => {
  it('renders date, time, vehicle, services, technician, and status', () => {
    render(<AppointmentCard appointment={makeAppointment()} />);

    expect(screen.getByText('Wed, Apr 15 at 2:00 PM')).toBeOnTheScreen();
    expect(screen.getByText('2020 Honda Civic')).toBeOnTheScreen();
    expect(screen.getByText('Oil Change, Tire Rotation')).toBeOnTheScreen();
    expect(screen.getByText('Sam Tech')).toBeOnTheScreen();
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
  });

  it('falls back to placeholders when vehicle/technician are missing', () => {
    render(
      <AppointmentCard
        appointment={makeAppointment({
          vehicle: undefined,
          technician: undefined,
          services: [],
        })}
      />,
    );

    expect(screen.getByText('Vehicle TBD')).toBeOnTheScreen();
    expect(screen.getByText('Technician TBD')).toBeOnTheScreen();
  });

  it('renders "TBD" when scheduled date/time are missing', () => {
    render(
      <AppointmentCard
        appointment={makeAppointment({
          scheduled_date: null,
          scheduled_time: null,
        })}
      />,
    );

    expect(screen.getByText('TBD at TBD')).toBeOnTheScreen();
  });

  it('uses the vehicle nickname when present', () => {
    render(
      <AppointmentCard
        appointment={makeAppointment({
          vehicle: {
            year: 2020,
            make: 'Honda',
            model: 'Civic',
            nickname: "Mom's Car",
          } as Appointment['vehicle'],
        })}
      />,
    );

    expect(screen.getByText("Mom's Car · 2020 Honda Civic")).toBeOnTheScreen();
  });

  it('invokes onPress when tapped', () => {
    const onPress = jest.fn();
    render(<AppointmentCard appointment={makeAppointment()} onPress={onPress} />);

    fireEvent.press(screen.getByText('2020 Honda Civic'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

// P5-CU-4 — Proposed change variant. Master plan §5.4.3 + §3.8.4.
function makeRescheduleIntent(
  overrides: Partial<CustomerVisibleIntent> = {},
): CustomerVisibleIntent {
  return {
    id: 901,
    session_id: 77,
    intent_type: 'reschedule',
    intent_status: 'proposed',
    appointment_id: 1,
    payload: {
      kind: 'reschedule',
      appointment_id: 1,
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
    session_id: 78,
    intent_type: 'cancel',
    intent_status: 'proposed',
    appointment_id: 1,
    payload: {
      kind: 'cancel',
      appointment_id: 1,
      cancellation_reason: 'tech_unavailable',
    },
    proposed_at: '2026-04-21T18:00:00.000Z',
    committed_at: null,
    ...overrides,
  };
}

function makePendingChange(
  intent: CustomerVisibleIntent,
  source: ReorganizationSessionSource = 'tech_app',
): AppointmentPendingChangeSummary {
  return {
    session_id: intent.session_id,
    source,
    intent,
    expires_at: null,
  };
}

describe('AppointmentCard — pendingChange variant (P5-CU-4)', () => {
  it('renders the date+time diff for a reschedule intent', () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        pendingChange={makePendingChange(makeRescheduleIntent(), 'tech_app')}
      />,
    );

    // Diff section is rendered.
    expect(screen.getByTestId('pending-change-diff')).toBeOnTheScreen();

    // Date + time rows show current → proposed. Default RNTL matcher is
    // exact-string; use a regex when we want a substring assertion against
    // the joined text content of the row.
    const dateRow = screen.getByTestId('pending-row-Date');
    expect(dateRow).toHaveTextContent(/Wed, Apr 15/);
    expect(dateRow).toHaveTextContent(/Wed, Apr 22/);

    const timeRow = screen.getByTestId('pending-row-Time');
    expect(timeRow).toHaveTextContent(/2:00 PM/);
    expect(timeRow).toHaveTextContent(/10:30 AM/);

    // Status badge is replaced by the source-of-intent badge.
    expect(screen.queryByText('Confirmed')).not.toBeOnTheScreen();
    expect(screen.getByText('Tech proposed')).toBeOnTheScreen();
  });

  it('only emits diff rows for fields that actually changed', () => {
    // Same date, only the time moves. Date row must not appear.
    const intent = makeRescheduleIntent({
      payload: {
        kind: 'reschedule',
        appointment_id: 1,
        new_scheduled_date: '2026-04-15',
        new_start_time: '16:00',
        new_end_time: '17:00',
      },
    });
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        pendingChange={makePendingChange(intent)}
      />,
    );

    expect(screen.queryByTestId('pending-row-Date')).not.toBeOnTheScreen();
    expect(screen.getByTestId('pending-row-Time')).toBeOnTheScreen();
  });

  it('surfaces a technician-change row when the reschedule includes new_technician_id', () => {
    const intent = makeRescheduleIntent({
      payload: {
        kind: 'reschedule',
        appointment_id: 1,
        new_scheduled_date: '2026-04-15',
        new_start_time: '14:00',
        new_end_time: '15:00',
        new_technician_id: 99,
      },
    });
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        pendingChange={makePendingChange(intent)}
      />,
    );

    const techRow = screen.getByTestId('pending-row-Technician');
    expect(techRow).toHaveTextContent(/Sam Tech/);
    expect(techRow).toHaveTextContent(/New technician assigned/);
  });

  it('renders a "Cancellation requested" status diff for a cancel intent', () => {
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        pendingChange={makePendingChange(makeCancelIntent(), 'franchise_dashboard')}
      />,
    );

    const statusRow = screen.getByTestId('pending-row-Status');
    expect(statusRow).toHaveTextContent(/Scheduled/);
    expect(statusRow).toHaveTextContent(/Cancellation requested/);
    expect(screen.getByText('Franchise proposed')).toBeOnTheScreen();
  });

  it('uses the source-specific badge label for each ReorganizationSessionSource', () => {
    const cases: [ReorganizationSessionSource, string][] = [
      ['tech_app', 'Tech proposed'],
      ['franchise_dashboard', 'Franchise proposed'],
      ['ai_suggestion', 'AI proposed'],
      // Customer-source copy must match master plan §5.4.7 verbatim.
      ['customer_app', 'Sent for franchise review'],
    ];

    for (const [source, label] of cases) {
      const { unmount } = render(
        <AppointmentCard
          appointment={makeAppointment()}
          pendingChange={makePendingChange(makeRescheduleIntent(), source)}
        />,
      );
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByTestId(`pending-source-badge-${source}`)).toBeOnTheScreen();
      unmount();
    }
  });

  it('renders the standard variant (no diff section, no source badge) when pendingChange is omitted', () => {
    render(<AppointmentCard appointment={makeAppointment()} />);

    expect(screen.queryByTestId('pending-change-diff')).not.toBeOnTheScreen();
    expect(screen.queryByText('Tech proposed')).not.toBeOnTheScreen();
    expect(screen.queryByText('Franchise proposed')).not.toBeOnTheScreen();
    expect(screen.queryByText('AI proposed')).not.toBeOnTheScreen();
    expect(screen.queryByText('Sent for franchise review')).not.toBeOnTheScreen();
    // Standard status badge is still there.
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
  });

  it('renders the standard variant when pendingChange is undefined (the appt.pending_change ?? undefined coalesce path)', () => {
    // Mirrors how the Home tab consumes the data:
    // `pendingChange={appt.pending_change ?? undefined}`. A `null` from
    // the API gets coalesced to `undefined` at the call site, so the
    // component should treat both identically.
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        pendingChange={undefined}
      />,
    );

    expect(screen.queryByTestId('pending-change-diff')).not.toBeOnTheScreen();
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
  });

  it('still calls onPress so callers (Home tab, inbox sheet) own the destination', () => {
    const onPress = jest.fn();
    render(
      <AppointmentCard
        appointment={makeAppointment()}
        pendingChange={makePendingChange(makeRescheduleIntent())}
        onPress={onPress}
      />,
    );

    fireEvent.press(screen.getByText('2020 Honda Civic'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
