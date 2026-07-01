import type {
  UserRole, UserStatus, AppointmentStatus, ObservationType,
  DeferredWorkSeverity, DeferredWorkStatus, PreferredTimeOfDay,
  CommunicationMode, SameTechStrength, ServiceBehavior, Weekday,
  PreferredLocation,
  TirePosition, FluidType, CheckResult, RecommendationSource,
  WorkSituation, RelocationStatus,
} from './enums';
import type { FleetRole } from './fleet';
import type { AppointmentPendingChangeSummary } from './reorganization';

export interface ApiResponse<T> {
  error: boolean;
  message: string;
  data: T;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: number;
  email: string;
  role: UserRole;
  fullName: string;
  fleetCompanyId?: number | null;
  fleetRole?: FleetRole | null;
}

export interface LoginResponse {
  tokens: TokenPair;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  stripe_customer_id: string | null;
  profile_image_url: string | null;
  default_address_id: number | null;
  provider: string | null;
  provider_id: string | null;
  fleet_company_id?: number | null;
  fleet_company_name?: string | null;
  fleet_role?: FleetRole | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: number;
  user_id: number;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  license_plate: string | null;
  license_plate_state: string | null;
  color: string | null;
  mileage: number | null;
  nickname?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddVehicleRequest {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  engine?: string;
  license_plate?: string;
  license_plate_state?: string;
  color?: string;
  mileage?: number;
}

/**
 * Sanitized response from `GET /customer/vehicles/decode-plate`. Year is a
 * string in CARFAX's payload — we coerce to number on the client when we
 * merge into AddVehicleRequest.
 */
export interface DecodePlateResult {
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
}

export interface UpdateVehicleRequest {
  nickname?: string | null;
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  duration_minutes: number;
  is_active: boolean;
  category: string | null;
  health_component: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  customer_id: number;
  technician_id: number | null;
  vehicle_id: number | null;
  address_id: number | null;
  franchise_id: number | null;
  status: AppointmentStatus;
  scheduled_date: string | null;
  scheduled_time: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  services?: AppointmentService[];
  vehicle?: Vehicle;
  technician?: { id: number; full_name: string; phone: string | null };
  address?: { address_line: string; city: string; state: string; zip: string } | null;
  /**
   * P5-CU-4: optional annotation surfaced when a pending reorganization
   * intent affects this appointment. Server-side BE wiring (the customer-
   * side analog of P6-BE-9) is not yet shipped — until then this field is
   * `undefined` for live data and the AppointmentCard renders normally.
   * See `src/types/reorganization.ts` for the full shape rationale.
   */
  pending_change?: AppointmentPendingChangeSummary | null;
}

export interface AppointmentService {
  id: number;
  appointment_id: number;
  service_id: number;
  price: number;
  quantity: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  service?: Service;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  reference_id: number | null;
  reference_type: string | null;
  read_at: string | null;
  created_at: string;
  metadata?: {
    partner_name?: string;
    partner_phone?: string;
    referral_category?: string;
    next_steps?: string;
  } | null;
}

export interface Address {
  id: number;
  user_id: number;
  address_line: string;
  city: string;
  state: string;
  zip: string;
  address_type: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddAddressRequest {
  address_line: string;
  city: string;
  state: string;
  zip: string;
  address_type?: string;
  lat?: number;
  lng?: number;
  is_default?: boolean;
}

export interface HealthScore {
  overall: number;
  components: {
    oil: number;
    filter: number;
    tires: number;
    wipers: number;
    brakes: number;
    fluids: number;
  };
}

export interface HealthTrendPoint {
  month: string;
  score: number;
}

export interface HealthScoreSnapshot {
  id: number;
  vehicle_id: number;
  overall_score: number;
  oil_life_score: number;
  filter_score: number;
  tire_score: number;
  wiper_score: number;
  brake_score: number | null;
  fluid_score: number | null;
  component_details: Record<string, unknown> | null;
  computed_at: string;
}

export interface VehicleHealthDetail {
  snapshot: HealthScoreSnapshot;
  trend: HealthTrendPoint[];
  deferred_items: DeferredWorkItem[];
}

export interface NextDueService {
  id: number;
  service_name: string;
  component: string;
  miles_until_due: number | null;
  days_until_due: number | null;
  urgency: 'overdue' | 'urgent' | 'upcoming' | 'on_track';
  recommended_service_id: number | null;
}

export interface ServiceHistoryEntry {
  id: number;
  service_type: string;
  date: string;
  technician_name: string | null;
  status: string;
  carfax_reported: boolean;
  services: string[];
}

export interface VehicleHealthComposite {
  health_score: HealthScoreSnapshot;
  trend: HealthTrendPoint[];
  next_due_services: NextDueService[];
  deferred_items: DeferredWorkItem[];
  service_history: ServiceHistoryEntry[];
  oem_recommendations: ManufacturerRecommendation[];
}

export interface DeferredWorkItem {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  customer_id: number;
  technician_id: number | null;
  observation_type: ObservationType;
  severity: DeferredWorkSeverity;
  technician_notes: string | null;
  photo_url: string | null;
  recommended_service_id: number | null;
  recommended_service?: Service;
  estimated_cost: number | null;
  status: DeferredWorkStatus;
  communicated_at: string | null;
  scheduled_appointment_id: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeferredBookingPrefill {
  vehicle_id: number;
  recommended_service_id: number | null;
  estimated_cost: number | null;
  observation_type: ObservationType;
  deferred_item_id: number;
}

export interface OnboardingStep {
  id: string;
  label: string;
  completed: boolean;
}

export interface BookingWizardState {
  selectedServices: Service[];
  selectedVehicle: Vehicle | null;
  selectedDate: string | null;
  selectedTime: string | null;
  selectedAddress: Address | null;
}

// MSG-FE-CUST: unified messaging types matching MSG-BE-1 backend contract.
// See `/Users/jacegalloway/Documents/codebases/REMITechnician/docs/implementation-plans/messaging-redo-plan.md`.

/**
 * A customer⇄technician conversation row, as returned by
 * `GET /messages/conversations` and `GET /messages/conversations/:id`
 * for the customer-facing API.
 *
 * IDs are numeric. `customer_unread_count` and
 * `technician_unread_count` are stored per side so each app can
 * source its own badge without re-deriving from messages — the
 * customer app reads `customer_unread_count`, the technician app
 * reads `technician_unread_count`.
 */
export interface Conversation {
  id: number;
  customer_id: number;
  customer_name: string | null;
  technician_id: number;
  technician_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  customer_unread_count: number;
  technician_unread_count: number;
  created_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  /**
   * MSG-BE-2 widened the producer side to include 'franchise_owner'
   * for messages an FO sends in their own voice. The customer-facing
   * thread renders these as "Customer Support" (see
   * `app/messages/[id].tsx`) — the customer should NEVER see the
   * literal "franchise_owner" wording surfaced anywhere in the UI.
   *
   * Silent-takeover messages (FO sending **as the assigned tech**)
   * continue to come down with `sender_type: 'technician'` and the
   * customer sees them attributed to the tech; only `sent_by_user_id`
   * differs from `sender_user_id` server-side. That asymmetry is
   * intentional and locked — see PLAN-DEVIATIONS.md
   * `2026-04-26-msg-redo`.
   */
  sender_type: 'customer' | 'technician' | 'system' | 'franchise_owner';
  sender_user_id: number | null;
  /**
   * MSG-BE-2 audit column — populated whenever a Franchise Owner
   * authored the message (either voice). The customer side does
   * NOT use this field for rendering (silent-takeover guarantee);
   * it ships in the type only so a future feature can re-enable
   * dual-attribution on the customer side without touching the
   * wire shape.
   */
  sent_by_user_id?: number | null;
  body: string;
  template_id: number | null;
  is_internal: boolean;
  is_pinned: boolean;
  created_at: string;
}

/**
 * Inbox-update payload pushed on `user:{userId}:inbox` whenever
 * either side's unread count changes (new message in any thread,
 * thread opened on the other side, etc.). See
 * REMIBackend `src/services/messaging/messaging.service.ts ::
 * publishDualChannel`.
 */
export interface InboxUpdatePayload {
  type: 'inbox_update';
  conversation_id: number;
  customer_unread_count: number;
  technician_unread_count: number;
}

/**
 * Per-thread message payload pushed on `conversation:{id}` for
 * each new message. The customer screen appends to its
 * messages cache.
 */
export interface NewMessagePayload {
  type: 'message';
  message: Message;
}

/**
 * @deprecated Replaced by `Conversation` (MSG-FE-CUST). Legacy
 *   appointment-scoped preview from the pre-redo messaging API.
 *   Kept for one release cycle so any straggling consumers fail
 *   loudly with a deprecation hint rather than a silent type
 *   error after rebase. Do not introduce new references.
 */
export interface ConversationPreview {
  appointmentId: number;
  technicianName: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
}

/**
 * @deprecated Replaced by `Message` (MSG-FE-CUST).
 */
export interface ChatMessage {
  id: number;
  appointment_id: number;
  sender_id: number;
  sender_role: 'customer' | 'technician' | 'dispatcher' | 'system';
  message_type: string;
  body: string;
  read_at: string | null;
  created_at: string;
  thread_id: number | null;
  is_internal: boolean;
  is_pinned: boolean;
}

export interface ScoreBreakdown {
  customerPreferenceMatch: number;
  routeEfficiency: number;
  technicianFamiliarity: number;
  inventoryReadiness: number;
  businessPriority: number;
  scheduleFit: number;
  penalties: number;
}

export interface ScoredSuggestion {
  technicianId: number;
  technicianName: string;
  date: string;
  timeSlot: string;
  insertionPosition: number;
  score: number;
  breakdown: ScoreBreakdown;
  explanation: string;
  estimatedDriveMinutes: number;
  isEcoSlot?: boolean;
  ecoDiscountAmount?: number;
  ecoDiscountType?: 'dollar' | 'credit';
  estimatedDurationMin?: number;
  durationConfidenceRangeMin?: number;
  /** True when slots are client-generated because the suggest API failed or returned none. */
  isFallbackSuggestion?: boolean;
}

export interface SuggestBookingRequest {
  serviceIds: number[];
  vehicleId?: number;
  addressId: number;
  preferredDateStart: string;
  preferredDateEnd: string;
  preferredTime?: string;
  franchiseId: number;
}

export interface ETAResponse {
  etaMinutes: number;
  distanceKm: number;
  distanceMi: number | null;
}

export interface BookingTrackingData {
  appointmentId: number;
  status: string;
  technicianName: string | null;
  technicianLat: number | null;
  technicianLng: number | null;
  technicianLocationUpdatedAt: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationAddress: string | null;
  etaMinutes: number | null;
  distanceKm: number | null;
  distanceMi: number | null;
}

export interface LocationUpdate {
  technicianId: number;
  technicianName: string;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface CustomerPreferences {
  id?: number;
  customer_id?: number;
  preferred_time_of_day: PreferredTimeOfDay | null;
  preferred_days: Weekday[];
  communication_mode: CommunicationMode | null;
  same_technician_preferred: boolean;
  same_tech_strength: SameTechStrength | null;
  no_go_times: string[];
  service_behavior: ServiceBehavior | null;
  access_instructions: string | null;
  lead_time_preference_days: number | null;
  preferred_location: PreferredLocation | null;
}

export interface VehiclePreferences {
  parking_preference: string | null;
  vehicle_orientation: string | null;
  known_quirks: string | null;
}

/**
 * @deprecated Replaced by `Conversation` (MSG-FE-CUST). Was the
 *   appointment-scoped inbox row before the messaging redo. Kept
 *   so legacy imports surface as deprecation warnings during
 *   transition.
 */
export interface ConversationThread {
  appointment_id: number;
  scheduled_date: string | null;
  other_participant_name: string;
  last_message_body: string;
  last_message_at: string;
  unread_count: number;
}

export interface TireTreadRecord {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  position: TirePosition;
  depth_mm: string | number;
  created_at: string;
}

export interface FluidLevelRecord {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  fluid_type: FluidType;
  measured_level: string;
  action_taken: string;
  created_at: string;
}

export interface ManufacturerRecommendation {
  id: number;
  vehicle_id: number;
  component: string;
  interval_miles: number | null;
  interval_months: number | null;
  last_checked_at: string | null;
  last_checked_result: CheckResult;
  next_due_miles: number | null;
  next_due_date: string | null;
  source: RecommendationSource;
  created_at: string;
  updated_at: string;
}

export interface CreateBookingRequest {
  serviceIds: number[];
  vehicleId: number;
  addressId: number;
  technicianId?: number;
  scheduledDate: string;
  scheduledTime: string;
  suggestionScore?: number;
  deferredItemId?: number;
  franchiseId: number;
}

export interface CreateBookingResponse {
  appointmentId: number;
  technicianName: string | null;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
}

export interface RescheduleAppointmentRequest {
  scheduledDate: string;
  scheduledTime: string;
}

export interface RescheduleAppointmentResponse {
  appointmentId: number;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
  status: string;
  /** True when the franchise's reorganization policy required FO review
   *  (status came back `pending_review`). False when the session
   *  auto-committed and the appointment is already moved. Added in
   *  P5-CU-3 — see master plan §5.4.7 / §2.5. */
  requiresApproval: boolean;
  /** Reorganization session id the request minted, when known. */
  sessionId?: number;
}

export interface CancelAppointmentRequest {
  reason: string;
}

export interface CancelAppointmentResponse {
  appointmentId: number;
  status: string;
  requiresApproval: boolean;
  sessionId?: number;
}

export interface WaitlistEntry {
  id: number;
  customer_id: number;
  service_ids: number[];
  vehicle_id: number;
  address_id: number;
  preferred_date: string;
  zone_id: number | null;
  position: number;
  estimated_wait_minutes: number | null;
  status: 'active' | 'offered' | 'claimed' | 'expired' | 'cancelled';
  offered_slot_date: string | null;
  offered_slot_time: string | null;
  offered_expires_at: string | null;
  created_at: string;
}

export interface JoinWaitlistRequest {
  serviceIds: number[];
  vehicleId: number;
  addressId: number;
  preferredDate: string;
  franchiseId: number;
}

export interface JoinWaitlistResponse {
  waitlistEntryId: number;
  position: number;
  estimatedWaitMinutes: number | null;
}

export interface ClaimWaitlistSlotRequest {
  waitlistEntryId: number;
}

export interface SubmitRatingRequest {
  appointmentId: number;
  tier: 'great' | 'okay' | 'not_good';
  tags: string[];
  comment?: string;
}

export interface NotificationPreferences {
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
}

export interface ServiceRecordPart {
  name: string;
  partNumber: string | null;
  quantity: number;
}

export interface ServiceRecordLineItem {
  serviceName: string;
  description: string | null;
  partsUsed: ServiceRecordPart[];
  laborMinutes: number | null;
  price: number;
}

export interface ServiceRecordTechnician {
  name: string;
  certificationLevel: string | null;
  photoUrl: string | null;
}

export interface ServiceRecordFranchise {
  name: string;
  locationName: string;
  address: string;
  phone: string | null;
  logoUrl: string | null;
}

export interface ServiceRecord {
  id: number;
  appointmentId: number;
  franchise: ServiceRecordFranchise;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
    mileageAtService: number | null;
  };
  technician: ServiceRecordTechnician;
  services: ServiceRecordLineItem[];
  completedAt: string;
  totalPrice: number;
  carfaxReported: boolean;
  carfaxReportedAt: string | null;
  digitalRecordUrl: string | null;
  pdfUrl: string | null;
}

export interface CustomerProfileDetails {
  id?: number;
  user_id: number;
  birthday: string | null;
  family_status: Record<string, unknown> | null;
  pets: Record<string, unknown>[] | null;
  work_situation: WorkSituation | null;
  relocation_status: RelocationStatus | null;
  personal_notes: Record<string, unknown>[] | null;
  household_notes: HouseholdNotes | null;
  created_at?: string;
  updated_at?: string;
}

export interface HouseholdNotes {
  members: HouseholdMember[];
  gate_code: string | null;
  dog_warning: string | null;
  preferred_parking: string | null;
  additional_notes: string | null;
}

export interface HouseholdMember {
  name: string;
  relationship: string;
  can_book: boolean;
}

export interface FleetVehicleCompliance {
  vehicle_id: number;
  vehicle_name: string;
  license_plate: string | null;
  assigned_driver: string | null;
  health_score: number;
  last_inspection_date: string | null;
  inspection_status: 'current' | 'due_soon' | 'overdue' | 'never';
  outstanding_service_items: number;
}

export interface StripePaymentMethod {
  id: string;
  type: string;
  card: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    funding: string;
  } | null;
  created: number;
}

export interface SetupIntentResponse {
  setupIntentSecret: string;
  ephemeralKey: string;
}

export interface ConfirmBookingPaymentRequest {
  paymentMethodId: string;
}

export interface FleetComplianceSummary {
  total_vehicles: number;
  inspected_count: number;
  overdue_count: number;
  outstanding_service_items: number;
  fleet_health_score: number;
  completion_rate: number;
  trend: HealthTrendPoint[];
  vehicles: FleetVehicleCompliance[];
}
