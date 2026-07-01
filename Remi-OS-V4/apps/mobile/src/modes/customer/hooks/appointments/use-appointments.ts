import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
// @demo-start
import { useDemoAppointmentStore } from '@/src/stores/customer/demo-appointments';
// @demo-end
import { randomUUID } from '@customer/utils/uuid';
import type {
  ApiResponse,
  Appointment,
  Service,
  RescheduleAppointmentRequest,
  RescheduleAppointmentResponse,
  CancelAppointmentRequest,
  CancelAppointmentResponse,
} from '@customer/types/api';
import type {
  CreateReorganizationSessionRequest,
  CreateReorganizationSessionResponse,
  CustomerVisibleSession,
  ReschedulePayload,
  CancelPayload,
} from '@customer/types/reorganization';

export function useAppointments() {
  // @demo-start
  const demoAppointments = useDemoAppointmentStore((s) => s.appointments);
  const demoOverrides = useDemoAppointmentStore((s) => s.overrides);
  // @demo-end

  const query = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Appointment[]>>(ENDPOINTS.APPOINTMENTS.LIST);
      return data.data;
    },
    staleTime: 30_000,
  });

  // @demo-start — merge demo appointments and apply overrides to real ones
  const merged = useMemo(() => {
    let real = query.data ?? [];
    if (Object.keys(demoOverrides).length > 0) {
      real = real.map((a) => (demoOverrides[a.id] ? { ...a, ...demoOverrides[a.id] } : a));
    }
    if (demoAppointments.length === 0) return real;
    const realIds = new Set(real.map((a) => a.id));
    const extras = demoAppointments.filter((d) => !realIds.has(d.id));
    return [...real, ...extras];
  }, [query.data, demoAppointments, demoOverrides]);
  // @demo-end

  return { ...query, data: merged };
}

export function useUpcomingAppointment() {
  const { data: appointments, ...rest } = useAppointments();

  const upcoming = appointments
    ?.filter((a) => !['completed', 'paid', 'cancelled'].includes(a.status))
    ?.sort((a, b) => {
      const da = a.scheduled_date ?? '';
      const db = b.scheduled_date ?? '';
      return da.localeCompare(db);
    })?.[0] ?? null;

  return { data: upcoming, ...rest };
}

/**
 * Compute "HH:mm" + minutes → "HH:mm".
 * Used to derive `new_end_time` for the reschedule intent payload from the
 * picked start slot + the appointment's existing service durations.
 */
function addMinutesToTimeOfDay(time: string, minutes: number): string {
  const [hStr, mStr] = time.split(':');
  const base = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  const total = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Default appointment duration when the appointment carries no services or
 * the services lack `duration_minutes`. 60min matches the backend default
 * window used by the suggest endpoint.
 */
const DEFAULT_APPOINTMENT_DURATION_MIN = 60;

function totalServiceMinutes(appointment: Appointment): number {
  const sum = (appointment.services ?? []).reduce(
    (acc, s) => acc + (s.service?.duration_minutes ?? 0),
    0,
  );
  return sum > 0 ? sum : DEFAULT_APPOINTMENT_DURATION_MIN;
}

/**
 * `POST /api/v1/customer/reorganizations` returns one of two shapes
 * depending on whether `finalize_immediately` was set (master plan §6.2):
 *
 *   1. `{ session, auto_committed, linter_warnings? }` (finalize path)
 *   2. `<CustomerVisibleSession>` directly (draft path)
 *
 * This wrapper always uses `finalize_immediately: true` (the customer-app
 * flows have no reason to keep an open draft), so case (1) is the expected
 * shape. Case (2) is still defended against in case the backend response
 * shape changes — defaults `auto_committed` from `session.status`.
 */
function normalizeMintResponse(
  raw: CreateReorganizationSessionResponse | CustomerVisibleSession,
): { session: CustomerVisibleSession; autoCommitted: boolean } {
  if ('session' in raw && raw.session) {
    return {
      session: raw.session,
      autoCommitted: Boolean(raw.auto_committed),
    };
  }
  const session = raw as CustomerVisibleSession;
  return {
    session,
    autoCommitted: session.status === 'committed',
  };
}

/**
 * Mint a single-intent reorganization session against
 * `POST /api/v1/customer/reorganizations`. Per master plan §6.3 the
 * endpoint requires an `Idempotency-Key` header (random UUID per submit
 * attempt; regenerated on retry — TanStack Query calls `mutationFn`
 * fresh on each retry, so passing a per-call key handles that naturally).
 *
 * The Axios request interceptor (`src/api/client.ts`) attaches the
 * Authorization header without disturbing per-request `headers`, so the
 * Idempotency-Key passes through verbatim — no interceptor change needed.
 */
async function mintSession(
  body: CreateReorganizationSessionRequest,
): Promise<{ session: CustomerVisibleSession; autoCommitted: boolean }> {
  const { data } = await apiClient.post<
    ApiResponse<CreateReorganizationSessionResponse | CustomerVisibleSession>
  >(ENDPOINTS.REORGANIZATIONS.CREATE, body, {
    headers: { 'Idempotency-Key': randomUUID() },
  });
  return normalizeMintResponse(data.data);
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      body,
    }: {
      appointmentId: number;
      body: RescheduleAppointmentRequest;
    }): Promise<RescheduleAppointmentResponse> => {
      // @demo-start — handle demo appointments locally
      if (appointmentId < 0) {
        const store = useDemoAppointmentStore.getState();
        const existing = store.appointments.find((a) => a.id === appointmentId);
        const oldDate = existing?.scheduled_date ?? '';
        const oldTime = existing?.scheduled_time ?? '';
        store.updateAppointment(appointmentId, {
          scheduled_date: body.scheduledDate,
          scheduled_time: body.scheduledTime,
        });
        return {
          appointmentId,
          oldDate,
          oldTime,
          newDate: body.scheduledDate,
          newTime: body.scheduledTime,
          status: 'confirmed',
          requiresApproval: false,
        };
      }
      // @demo-end

      // P5-CU-3: re-pointed from `PUT /appointments/:id/reschedule` to the
      // single-intent reorganization session mint. Master plan §5.4.7.
      const allAppts = queryClient.getQueryData<Appointment[]>(['appointments']) ?? [];
      const existing = allAppts.find((a) => a.id === appointmentId);
      const oldDate = existing?.scheduled_date ?? '';
      const oldTime = existing?.scheduled_time ?? '';
      const durationMin = existing
        ? totalServiceMinutes(existing)
        : DEFAULT_APPOINTMENT_DURATION_MIN;
      const newEndTime = addMinutesToTimeOfDay(body.scheduledTime, durationMin);

      const intent: ReschedulePayload = {
        kind: 'reschedule',
        appointment_id: appointmentId,
        new_scheduled_date: body.scheduledDate,
        new_start_time: body.scheduledTime,
        new_end_time: newEndTime,
      };

      const { session, autoCommitted } = await mintSession({
        initial_intents: [intent],
        finalize_immediately: true,
      });

      return {
        appointmentId,
        oldDate,
        oldTime,
        newDate: body.scheduledDate,
        newTime: body.scheduledTime,
        status: autoCommitted ? 'confirmed' : (existing?.status ?? 'confirmed'),
        requiresApproval: !autoCommitted,
        sessionId: session.id,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      body,
    }: {
      appointmentId: number;
      body: CancelAppointmentRequest;
    }): Promise<CancelAppointmentResponse> => {
      // @demo-start — handle demo appointments locally
      if (appointmentId < 0) {
        useDemoAppointmentStore.getState().updateAppointment(appointmentId, {
          status: 'cancelled' as Appointment['status'],
          cancellation_reason: body.reason,
        });
        return { appointmentId, status: 'cancelled', requiresApproval: false };
      }
      // @demo-end

      // P5-CU-3: re-pointed from `PUT /appointments/:id/cancel` to the
      // single-intent reorganization session mint. Master plan §5.4.7.
      const intent: CancelPayload = {
        kind: 'cancel',
        appointment_id: appointmentId,
        cancellation_reason: body.reason,
      };

      const { session, autoCommitted } = await mintSession({
        initial_intents: [intent],
        finalize_immediately: true,
      });

      return {
        appointmentId,
        status: autoCommitted ? 'cancelled' : 'pending_cancel',
        requiresApproval: !autoCommitted,
        sessionId: session.id,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useAddServiceToAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      serviceId,
      deferredItemId,
    }: {
      appointmentId: number;
      serviceId: number;
      deferredItemId?: number;
    }) => {
      const now = new Date().toISOString();
      const allServices = queryClient.getQueryData<Service[]>(['services']) ?? [];
      const makeEntry = (sid: number) => {
        const svc = allServices.find((s) => s.id === sid);
        return {
          id: 0,
          appointment_id: appointmentId,
          service_id: sid,
          price: svc ? Number(svc.base_price) : (0 as any),
          quantity: 1,
          status: 'pending' as const,
          started_at: null,
          completed_at: null,
          created_at: now,
          service: svc,
        };
      };

      // @demo-start — resolve the *current* services including any prior overrides
      const resolveCurrentServices = () => {
        const store = useDemoAppointmentStore.getState();
        if (appointmentId < 0) {
          const demo = store.appointments.find((a) => a.id === appointmentId);
          return demo?.services ?? [];
        }
        const override = store.overrides[appointmentId];
        if (override?.services) return override.services;
        const baseAppts = queryClient.getQueryData<Appointment[]>(['appointments']) ?? [];
        return baseAppts.find((a) => a.id === appointmentId)?.services ?? [];
      };

      const addLocally = (sid: number) => {
        const current = resolveCurrentServices();
        if (current.some((s) => s.service_id === sid)) return;
        const updated = [...current, makeEntry(sid)];
        const store = useDemoAppointmentStore.getState();
        if (appointmentId < 0) {
          store.updateAppointment(appointmentId, { services: updated });
        } else {
          store.overrideAppointment(appointmentId, { services: updated });
        }
        queryClient.setQueryData<Appointment[]>(['appointments'], (old) =>
          (old ?? []).map((a) =>
            a.id === appointmentId ? { ...a, services: updated } : a,
          ),
        );
      };
      // @demo-end

      // @demo-start — for demo appointments (negative IDs), update local store
      if (appointmentId < 0) {
        addLocally(serviceId);
        return { appointmentId, services: [] };
      }
      // @demo-end

      // For real (positive-ID) appointments we no longer silently fall back to
      // the demo override store on API failure. A failed Add Service call has
      // to surface as an error so the user knows the service wasn't actually
      // added — fabricating a "success" via local override means the customer
      // sees the service on their appointment but the technician never does.
      const { data } = await apiClient.post<ApiResponse<{ appointmentId: number; services: unknown[] }>>(
        ENDPOINTS.APPOINTMENTS.ADD_SERVICE(appointmentId),
        { serviceId, deferredItemId },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['deferredItems'] });
    },
  });
}
