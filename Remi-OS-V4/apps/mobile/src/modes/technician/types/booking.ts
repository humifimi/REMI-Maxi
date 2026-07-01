import type { Appointment, User } from "./api";

// Walk-in booking contract — `wellness-ai-and-walk-in-contract.md` § 2.
// Path: POST /api/v1/technician/jobs/walk-in (NOT /walk-in/book).
// Either `customer_id` or `new_customer` must be provided — never both.
// Server fills tech_id from JWT and stamps `creation_source: 'WALK_IN'`.
export interface WalkInBookingRequest {
  vehicle_id: number;
  customer_id?: number;
  new_customer?: { full_name: string; phone: string };
  service_ids: number[];
  notes?: string;
}

export interface WalkInBookingResponse {
  appointment_id: number;
  vehicle_id: number;
  customer_id: number;
  service_ids: number[];
  scheduled_for: string;
  customer_sms_sent: boolean;
}

// --- Active-appointment check (UI-side normalized shape) ---
// Powered by GET /technician/appointments?vehicle_id=X&status=active. The
// backend returns `Appointment[]`; the hook normalizes to this card-friendly
// shape so callers don't have to re-derive it on every render.
export interface ActiveAppointmentCheck {
  has_active: boolean;
  appointment_id: number | null;
  customer_name: string | null;
  scheduled_time: string | null;
  services: string | null;
}

export interface QuickRegisterCustomer {
  full_name: string;
  phone: string;
  email?: string;
}

// Legacy export kept for any consumer importing the old union response shape.
// New code should consume `WalkInBookingResponse` directly.
export interface LegacyWalkInBookingResponse {
  appointment: Appointment;
  customer: User | null;
  is_new_customer: boolean;
}
