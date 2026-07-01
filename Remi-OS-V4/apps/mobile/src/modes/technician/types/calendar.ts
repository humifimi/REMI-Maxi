import type {
  AppointmentStatus,
  SlotType,
  BookingMethod,
  LocationType,
  CalendarNotificationPreference,
  FlexListStatus,
  AlertType,
  CalendarAlertSeverity,
  QuickTextTemplate,
} from "./enums";
import type { PendingIntentSummary } from "./reorganization";

// ── Location Address ────────────────────────────────────────────

export interface LocationAddress {
  line_1: string;
  line_2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}

// ── Scoring ─────────────────────────────────────────────────────

export interface ScoringFactors {
  preference: number;
  route_efficiency: number;
  technician_familiarity: number;
  skill_inventory_match: number;
  business_priority: number;
  schedule_fit: number;
  total_score: number;
}

// ── Tax ─────────────────────────────────────────────────────────

export interface AppointmentTaxLine {
  id: string;
  appointment_id: number;
  jurisdiction: string;
  rate: number;
  amount: number;
  created_at: string;
}

export interface FranchiseTaxRate {
  id: string;
  franchise_id: number;
  jurisdiction: string;
  rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Alerts ──────────────────────────────────────────────────────

export interface AppointmentAlert {
  id: string;
  appointment_id: number;
  type: AlertType;
  message: string;
  severity: CalendarAlertSeverity;
  resolved_at: string | null;
  created_at: string;
}

// ── QuickText ───────────────────────────────────────────────────

export interface QuickTextLogEntry {
  id: string;
  appointment_id: number;
  template: QuickTextTemplate;
  sent_by: number;
  sent_at: string;
}

// ── Personal Events ─────────────────────────────────────────────

export interface PersonalEvent {
  id: string;
  franchise_id: number;
  created_by: number;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  recurrence_rule: string | null;
  notes: string | null;
  shared_with: number[];
  created_at: string;
  updated_at: string;
}

// ── Flex List ───────────────────────────────────────────────────

export interface FlexListEntry {
  id: string;
  franchise_id: number;
  customer_id: number;
  customer_name?: string;
  customer_phone?: string;
  preferred_service_id: number | null;
  preferred_vehicle_id: number | null;
  preferred_time_window: string | null;
  preferred_technician_id: number | null;
  notes: string | null;
  status: FlexListStatus;
  offered_at: string | null;
  booked_appointment_id: number | null;
  created_at: string;
  updated_at: string;
}

// ── Calendar Service Item ───────────────────────────────────────

export interface CalendarServiceItem {
  service_id: number;
  service_name: string;
  price: number;
  quantity: number;
  technician_qualified: boolean;
}

// ── Calendar Views ──────────────────────────────────────────────

export interface CalendarAppointmentItem {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  has_card_on_file: boolean;
  technician_id: number | null;
  technician_name: string | null;
  franchise_id: number | null;
  status: AppointmentStatus;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_end_time: string | null;
  started_at: string | null;
  completed_at: string | null;
  slot_type: SlotType;
  booking_method: BookingMethod;
  location_type: LocationType;
  location_address: LocationAddress | null;
  /**
   * 2026-05-25 — joined from `addresses` via `a.address_id` on the
   * BE calendar query. The detail sheet falls back to these fields
   * when `location_address` (FO-entered one-off JSONB) is null — i.e.
   * the common case where the appointment uses the customer's
   * default address. Either field is null when the appointment has
   * no `address_id` at all (walk-in / address-less customer).
   */
  address_line: string | null;
  address_city: string | null;
  notification_preference: CalendarNotificationPreference;
  explanation: string | null;
  scoring_factors: ScoringFactors | null;
  appointment_note: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  no_show_at: string | null;
  recurrence_rule: string | null;
  recurrence_series_id: string | null;
  fleet_account_id: number | null;
  booked_by: number | null;
  booked_by_name: string | null;
  services: CalendarServiceItem[];
  tax_lines: AppointmentTaxLine[];
  alerts: AppointmentAlert[];
  /**
   * Server-side annotation joined onto every appointment row the
   * calendar canvas consumes (P6-BE-9 / `P3-FE-8`). When non-null,
   * one or more `reorganization_intents` whose parent session is in
   * `('draft', 'pending_review')` target this appointment — i.e.,
   * a pending change is staged against it.
   *
   * The field is ALWAYS present on the wire (`null` when no active
   * intents) — selectors can rely on the union narrowing directly
   * without an `?? null` fallback. See
   * `src/types/reorganization.ts` for the field contract.
   */
  pending_intent_summary: PendingIntentSummary | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarTechnicianColumn {
  technician_id: number;
  technician_name: string;
  profile_image_url: string | null;
  job_count: number;
  completed_count: number;
  appointments: CalendarAppointmentItem[];
  personal_events: PersonalEvent[];
}

export interface CalendarDayResponse {
  date: string;
  technicians: CalendarTechnicianColumn[];
}

export interface MonthViewDay {
  date: string;
  appointment_count: number;
  capacity: "light" | "moderate" | "full";
  status_breakdown: {
    pending: number;
    completed: number;
    cancelled: number;
    in_progress: number;
  };
}

export interface MonthViewResponse {
  days: MonthViewDay[];
}

// ── Search / Catalog ────────────────────────────────────────────

export interface CustomerSearchResult {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  has_card_on_file: boolean;
  fleet_company_name: string | null;
}

export interface ServiceListItem {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  service_code: string | null;
}

// ── Scored Slot (Generate Appointment) ──────────────────────────

export interface ScoredSlot {
  technician_id: number;
  technician_name: string;
  date: string;
  start_time: string;
  end_time: string;
  explanation: string;
  scoring_factors: ScoringFactors;
}

// ── Route Visualization ─────────────────────────────────────────

export interface RouteVisualizationStop {
  appointment_id: number;
  customer_name: string;
  address: LocationAddress | null;
  lat: number | null;
  lng: number | null;
  time: string;
  status: string;
}

export interface RouteVisualizationTechnician {
  id: number;
  name: string;
  color: string;
  route: {
    stops: RouteVisualizationStop[];
    polyline?: string;
    total_drive_minutes: number;
    total_distance_miles: number;
  };
  current_location?: { lat: number; lng: number; updated_at: string };
}

export interface RouteVisualizationResponse {
  technicians: RouteVisualizationTechnician[];
}

// ── Daily Briefing (Expanded) ───────────────────────────────────

export interface FranchiseBriefingExpanded {
  date: string;
  total_jobs: number;
  completed: number;
  pending: number;
  delayed: number;
  fleet_alerts: { vehicle_id: number; message: string }[];
  technician_alerts: { technician_id: number; message: string }[];
  optimization_suggestions: string[];
  weather_alert?: string;
  revenue_today: number;
}

// ── Payloads (client → server) ──────────────────────────────────

export interface LineItemPayload {
  description: string;
  amount: number;
  type: string;
  quantity?: number;
}

export interface CreateAppointmentFromCalendarPayload {
  customer_id: number;
  service_ids: number[];
  technician_id: number;
  start_time: string;
  end_time: string;
  location_type: LocationType;
  location_address?: LocationAddress;
  appointment_note?: string;
  notification_preference?: CalendarNotificationPreference;
  slot_type?: SlotType;
  line_items?: LineItemPayload[];
  recurrence_rule?: string;
}

export interface UpdateAppointmentPayload {
  technician_id?: number;
  start_time?: string;
  end_time?: string;
  location_type?: LocationType;
  location_address?: LocationAddress;
  appointment_note?: string;
  notification_preference?: CalendarNotificationPreference;
  slot_type?: SlotType;
  line_items?: LineItemPayload[];
}

export interface ReschedulePayload {
  new_start_time: string;
  new_end_time: string;
  new_technician_id?: number;
  notification_preference?: CalendarNotificationPreference;
  custom_message?: string;
}

export interface CancelPayload {
  reason?: string;
  notification_preference?: CalendarNotificationPreference;
  custom_message?: string;
}

export interface NoShowPayload {
  notify_customer?: boolean;
}

export interface QuickTextPayload {
  template: QuickTextTemplate;
}

export interface GenerateAppointmentPayload {
  customer_id: number;
  service_ids: number[];
  preferred_date_start: string;
  preferred_date_end: string;
  location_type: LocationType;
  location_address?: LocationAddress;
}

export interface CreatePersonalEventPayload {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  recurrence_rule?: string;
  shared_with?: number[];
  notes?: string;
}

export interface CreateFlexListEntryPayload {
  customer_id: number;
  preferred_service_id?: number;
  preferred_vehicle_id?: number;
  preferred_time_window?: string;
  preferred_technician_id?: number;
  notes?: string;
}

export interface FlexListOfferPayload {
  custom_message?: string;
}

export interface QuickCreateCustomerPayload {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
}

export interface TaxRateUpsertPayload {
  jurisdiction: string;
  rate: number;
}
