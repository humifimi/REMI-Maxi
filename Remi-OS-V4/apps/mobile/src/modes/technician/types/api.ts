import type {
  UserRole,
  UserStatus,
  AppointmentStatus,
  AppointmentServiceStatus,
  LineItemType,
  InventoryReasonCode,
  RouteStatus,
  RouteStopStatus,
  PurchaseOrderStatus,
  FleetPaymentTerms,
  FleetInvoiceFrequency,
  ShieldInspectionStatus,
  CertificationStatus,
  ReferralStatus,
  ReferralRoutingMode,
  ReferralPayoutStatus,
  ObservationType,
  Severity,
  DeferredWorkItemStatus,
  ShuttleStatus,
  ShuttlePriority,
  ShopServiceStatus,
} from "./enums";

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
  profileImageUrl?: string | null;
  franchiseId?: number;
  roleId?: number;
  fleetRoleId?: number | null;
  appMode?: "customer" | "technician";
  /** Customer / fleet-manager app fields */
  fleetCompanyId?: number | null;
  fleetRole?: string | null;
}

export interface LoginResponse {
  tokens: TokenPair;
  user: AuthUser;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  profile_image_url: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface DecodedVehicle {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  base_vehicle_id: number | null;
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  base_price: number;
  duration_minutes: number;
  is_active: boolean;
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
  customer?: User;
  vehicle?: Vehicle;
  customer_name?: string | null;
  customer_phone?: string | null;
  technician_name?: string | null;
  vehicle_year?: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  address_line?: string | null;
  address_city?: string | null;
  service_names?: string | null;
  total_amount?: number | null;
  fleet_company_name?: string | null;
  pay_status?: string | null;
  license_plate?: string | null;
  mileage?: number | null;
  address_lat?: number | null;
  address_lng?: number | null;
  estimated_travel_minutes?: number | null;
  /**
   * D2P-FE-4 (2026-04-25): timestamp set when an FO bulk-tags an
   * appointment for review (`POST /orders/tag-for-review`). Null
   * until tagged. Surfaced as a small "Review" pill on `OrderCard`.
   */
  tagged_for_review_at?: string | null;
  /**
   * Phase 2 Chunks 2.1–2.3: appointment-level CARFAX submission columns.
   * Populated by `buildEnrichedAppointmentQuery` on `/orders/search` so
   * the Order Manager status badge can render without an extra fetch.
   * Distinct from the legacy `CarfaxStatus` interface above (which models
   * the `carfax_reports` table + dry-run flow) — these fields map to the
   * `appointments.carfax_*` columns and the new submission/retry
   * pipeline. See `src/components/orders/order-carfax-badge.tsx` for
   * the visual mapping rules.
   */
  carfax_status?: import("./enums").AppointmentCarfaxStatus;
  carfax_attempt_count?: number;
  carfax_last_error?: string | null;
  carfax_reported_at?: string | null;
}

export interface AppointmentService {
  id: number;
  appointment_id: number;
  service_id: number;
  price: number;
  quantity: number;
  status: AppointmentServiceStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  service?: Service;
}

export interface AppointmentLineItem {
  id: number;
  appointment_id: number;
  appointment_service_id: number | null;
  type: LineItemType;
  description: string;
  part_number: string | null;
  manufacturer: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  source: string | null;
  source_ref: string | null;
  created_at: string;
  // Phase 3 Chunk 3.2 — substitution recording. Original-original SKU is
  // preserved in `substituted_for_part_number` on first substitute and
  // never overwritten; `substitution_reason` is free-text optional.
  substituted_for_part_number?: string | null;
  substitution_reason?: string | null;
}

/**
 * Phase 6 Chunk 6.1.1 (promptless follow-up to Chunk 6.1) — invoice
 * package shape for the in-app Invoice Review screen, mirroring the
 * receipt PDF's `ReceiptPackage`. Line items are grouped by the
 * underlying `services.id` (recovered via the `appointment_services`
 * LEFT JOIN); rows whose `appointment_service_id` is NULL roll into a
 * synthetic `"Additional items"` package with `description: null`.
 */
export interface InvoicePackage {
  name: string;
  description: string | null;
  line_items: AppointmentLineItem[];
  package_total: number;
}

export interface InvoiceCustomerAddress {
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface Invoice {
  appointment: Appointment;
  lineItems: AppointmentLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  // Phase 6 Chunk 6.1.1 — Droptop-style fields for the Invoice Review
  // screen. Every field is independently optional so legacy consumers
  // that read only the original 5 fields keep working.
  customer?: User | null;
  customerAddress?: InvoiceCustomerAddress | null;
  vehicle?: Vehicle | null;
  packages?: InvoicePackage[];
  amountDue?: number;
}

export interface InspectionTemplateField {
  id: number;
  template_id: number;
  label: string;
  field_type: "toggle" | "numeric" | "text" | "photo" | "select";
  options: Record<string, unknown> | null;
  is_required: boolean;
  sort_order: number;
}

export interface InspectionItem {
  id: number;
  appointment_id: number;
  template_field_id: number;
  value: string | null;
  photo_url: string | null;
  notes: string | null;
}

export interface ChecklistData {
  template: {
    id: number;
    name: string;
    fields: InspectionTemplateField[];
  };
  existing: InspectionItem[];
}

export interface ChecklistSubmitItem {
  template_field_id: number;
  value: string;
  photo_url?: string;
  notes?: string;
}

export interface TechnicianSchedule {
  id: number;
  technician_id: number;
  schedule_date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  notes: string | null;
}

export interface ScheduleDay {
  date: string;
  appointments: Appointment[];
  availability: TechnicianSchedule | null;
}

export interface StockLevel {
  item_id: number;
  location_id: number;
  on_hand: number;
  reserved: number;
  available: number;
  item_name?: string;
  item_sku?: string;
  location_name?: string;
  technician_name?: string;
}

export interface ParLevelAlert {
  item_id: number;
  location_id: number;
  item_name: string;
  item_sku: string;
  location_name: string;
  on_hand: number;
  par_min: number;
  par_target: number;
  deficit: number;
}

export interface WasteContainer {
  id: number;
  location_id: number;
  type: string;
  capacity_liters: number;
  current_level_liters: number;
  warning_threshold_pct: number;
  critical_threshold_pct: number;
  location_name?: string;
  technician_name?: string;
}

// Wire shape from REMIBackend POST /jobs/:id/collect-payment.
// Phase 6 Chunk 6.2 reverted Chunk 1.2's camelCase override — the BE
// controller now normalizes the response to snake_case at the
// controller boundary (see REMIBackend technician.controller.ts
// `collectPayment`), matching every other technician-route response
// shape. `useConfirmPayment` already POSTs `payment_intent_id`
// snake_case so consumers across the FE are now consistent.
export interface PaymentIntentResult {
  client_secret: string;
  ephemeral_key: string;
  payment_intent_id: string;
}

export type CarfaxReportMode = "live" | "dry-run" | "disabled";

export interface CarfaxStatus {
  status: import("./enums").CarfaxReportStatus;
  reported_at: string | null;
  error_reason: string | null;
  /** Active backend `CARFAX_REPORT_MODE` at the time of the read. */
  mode?: CarfaxReportMode;
  /** True when the latest carfax_reports row was produced by a dry-run. */
  dry_run?: boolean;
}

/**
 * Phase 2 Chunk 2.3: per-franchise CARFAX cadence settings, returned by
 * `GET /franchise/settings/carfax`. `carfax_location_id` is a read-only
 * echo so the settings screen can show whether QuickVIN Plus is wired
 * up — it's edited via the admin integrations surface, not here.
 */
export interface CarfaxSettings {
  carfax_submission_cadence: import("./enums").CarfaxCadence;
  carfax_location_id: string | null;
}

export interface QuickVinLookupResult {
  vin: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  raw: Record<string, unknown>;
}

export interface ServiceHistoryServiceCategory {
  serviceName: string;
  dateOfLastService?: string;
  odometerOfLastService?: string;
}

export interface ServiceHistoryDisplayRecord {
  displayDate?: string;
  odometer?: string;
  text?: string[];
  type?: string;
}

export interface ServiceHistoryResult {
  carfaxRequest?: {
    requestTime?: number;
    vin?: string;
    productDataId?: string;
    locationId?: string;
  };
  errorMessages: { errors?: { code: number; message: string }[] };
  serviceHistory?: {
    vin?: string;
    make?: string;
    model?: string;
    year?: string;
    bodyTypeDescription?: string;
    engineInformation?: string;
    driveline?: string;
    serviceCategories?: ServiceHistoryServiceCategory[];
    displayRecords?: ServiceHistoryDisplayRecord[];
    numberOfServiceRecords?: number;
  };
}

/**
 * D2P-FE-4 (2026-04-25): backend `appointment_notes` row, surfaced on the
 * job detail payload so the order detail screen can list past notes
 * without a second round-trip.
 */
export interface AppointmentNote {
  id: number;
  appointment_id: number;
  author_user_id: number | null;
  note: string;
  created_at: string;
}

export interface JobDetail {
  appointment: Appointment;
  services: AppointmentService[];
  carfax?: CarfaxStatus | null;
  notes?: AppointmentNote[];
}

export interface IncomingDispatch {
  appointment_id: number;
  customer_name: string;
  vehicle_summary: string;
  service_names: string[];
  scheduled_date: string;
  scheduled_time: string;
  address_line: string | null;
  address_city: string | null;
  estimated_duration_minutes: number;
  distance_miles: number | null;
}

export interface AcceptDispatchResponse {
  appointment: Appointment;
}

export interface RejectDispatchResponse {
  acknowledged: boolean;
}

export const RatingTag = {
  FRIENDLY: "friendly",
  PREPARED: "prepared",
  DIFFICULT_ACCESS: "difficult_access",
  NO_SHOW: "no_show",
  LATE: "late",
  TIDY_WORKSPACE: "tidy_workspace",
} as const;

export type RatingTag = (typeof RatingTag)[keyof typeof RatingTag];

export interface TechRatingPayload {
  stars: number;
  tags: RatingTag[];
}

/**
 * MSG-BE-1 conversation list shape. The same row carries BOTH
 * unread counters; this app reads `technician_unread_count` for
 * its badge surfaces. `customer_unread_count` is included for
 * symmetry with the customer-side mirror but is not surfaced in
 * UI here. See
 * `docs/implementation-plans/messaging-redo-plan.md` and
 * `docs/PLAN-DEVIATIONS.md#2026-04-26-msg-redo` for the
 * "client picks its own counter" decision.
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
  sender_type: "technician" | "customer" | "system" | "franchise_owner";
  sender_user_id?: number | null;
  /**
   * MSG-BE-2 — actual sender (audit trail). Distinct from
   * `sender_user_id` (the "voice") only when an FO sends a message
   * "on behalf of" the assigned technician (silent takeover); in
   * every other case `sent_by_user_id === sender_user_id` and the
   * server just echoes whichever is already populated.
   */
  sent_by_user_id?: number | null;
  body: string;
  template_id: number | null;
  is_internal: boolean;
  is_pinned: boolean;
  created_at: string;
}

export interface MessageTemplate {
  id: number;
  label: string;
  body: string;
  category: string;
}

/**
 * Inbox-channel WS payload published by MSG-BE-1 on
 * `user:{userId}:inbox` whenever any conversation involving this
 * user changes. Carries both counters; the client reads the one
 * matching its role.
 */
export interface InboxUpdatePayload {
  type: "inbox_update";
  conversation_id: number;
  customer_unread_count: number;
  technician_unread_count: number;
}

/**
 * Conversation-channel WS payload published by MSG-BE-1 on
 * `conversation:{id}` whenever a new message lands in that
 * thread.
 */
export interface NewMessagePayload {
  type: "message";
  message: Message;
}

/**
 * MSG-BE-2 — FO oversight conversation list item. Identical wire
 * shape to the participant-side `Conversation`; the FE keeps the
 * alias as a separate type so the inbox screens can grow
 * franchise-specific UI fields (per-FO last-viewed badge, etc.)
 * without churning every tech-side caller. Both `customer_name`
 * and `technician_name` are populated server-side.
 */
export type FranchiseConversationListItem = Conversation;

/**
 * MSG-BE-2 — `GET /api/v1/franchise/messages/conversations/:id`
 * envelope. Returns the conversation header alongside the full
 * message list so the FO UI can render customer/tech names
 * without a second GET.
 */
export interface FranchiseConversationThread {
  conversation: FranchiseConversationListItem;
  messages: Message[];
}

/**
 * MSG-BE-2 — `franchise:{franchiseId}:messages` reuses the same
 * two-frame protocol as the per-user inbox channel: an
 * `InboxUpdatePayload` (counters + conversation id) plus a
 * `NewMessagePayload` (full message row) on every send anywhere
 * in the franchise. The FO realtime hook narrows on `type` and
 * patches the inbox cache + any open thread cache off the same
 * subscription.
 */
export type FranchiseMessagesPayload =
  | InboxUpdatePayload
  | NewMessagePayload;

// --- Phase 3: Routes & Dispatch ---

export interface Route {
  id: number;
  franchise_id: number;
  technician_id: number;
  date: string;
  status: RouteStatus;
  start_lat: number | null;
  start_lng: number | null;
  estimated_distance_km: number | null;
  estimated_distance_mi: number | null;
  estimated_duration_min: number | null;
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: number;
  route_id: number;
  appointment_id: number;
  stop_order: number;
  estimated_arrival: string | null;
  estimated_departure: string | null;
  actual_arrival: string | null;
  actual_departure: string | null;
  drive_time_from_previous_min: number | null;
  drive_distance_from_previous_km: number | null;
  drive_distance_from_previous_mi: number | null;
  status: RouteStopStatus;
  customer_id?: number | null;
  customer_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteStopWithDetails extends RouteStop {
  customer_name: string | null;
  address_line: string | null;
  address_city: string | null;
  address_lat: number | null;
  address_lng: number | null;
  scheduled_time: string | null;
  service_names: string | null;
  stock_status?: "ok" | "low" | "out" | null;
  stock_issue_count?: number;
}

export interface RouteWithStops extends Route {
  stops: RouteStopWithDetails[];
}

export interface TechnicianLocation {
  id: number;
  technician_id: number;
  lat: number;
  lng: number;
  updated_at: string;
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
}

export interface SuggestDispatchInput {
  customerId: number;
  serviceIds: number[];
  vehicleId?: number;
  addressId: number;
  preferredDateStart: string;
  preferredDateEnd: string;
  preferredTime?: string;
  franchiseId: number;
}

export interface FranchiseCalendarEntry {
  route: Route;
  technicianName: string;
  stops: RouteStop[];
  stopCount: number;
}

export interface DispatchOverviewRoute extends Route {
  technician_name: string;
  stop_count: number;
}

export interface DispatchOverviewTechLocation extends TechnicianLocation {
  full_name: string;
}

export interface DispatchOverviewSummary {
  totalRoutes: number;
  activeRoutes: number;
  completedStops: number;
  pendingStops: number;
  delayedStops: number;
}

export interface DispatchOverview {
  routes: DispatchOverviewRoute[];
  technicianLocations: DispatchOverviewTechLocation[];
  summary: DispatchOverviewSummary;
}

export interface ReassignResult {
  fromRoute: RouteWithStops | null;
  toRoute: RouteWithStops;
}

// --- Phase 4: Franchise Operations ---

export interface InventoryLedgerEntry {
  id: number;
  item_id: number;
  location_id: number;
  quantity_change: number;
  reason_code: InventoryReasonCode;
  appointment_id: number | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  item_name?: string;
  item_sku?: string;
  location_name?: string;
  technician_name?: string;
}

export interface ReorderSuggestion {
  item_id: number;
  item_name: string;
  item_sku: string;
  location_id: number;
  on_hand: number;
  par_min: number;
  par_target: number;
  suggested_quantity: number;
  location_name?: string;
  technician_name?: string;
}

export interface Supplier {
  id: number;
  franchise_id: number;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  items_supplied: Record<string, unknown> | null;
  lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrder {
  id: number;
  franchise_id: number;
  supplier_id: number;
  location_id: number;
  status: PurchaseOrderStatus;
  po_number: string | null;
  ordered_by: number | null;
  submitted_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: number;
  purchase_order_id: number;
  item_id: number;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number | null;
  created_at: string;
  updated_at: string;
}

export interface FleetCompany {
  id: number;
  franchise_id: number;
  name: string;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_address_line: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  contract_terms: string | null;
  approved_services: number[] | null;
  payment_terms: FleetPaymentTerms;
  po_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /**
   * 2026-05-25 — denormalized aggregates returned by
   * `/franchise/fleet/companies`. Lets the Fleet Manager list
   * screen render rich cards without issuing N=161 per-row
   * `/companies/:id/dashboard` calls. Detail screen still calls
   * `useFleetDashboard` for the richer per-fleet data
   * (overdue/due-soon counts that require per-vehicle compute).
   *
   * Optional + may be absent on responses from `getCompanyById`,
   * `createCompany`, `updateCompany`.
   */
  vehicle_count?: number;
  last_service_date?: string | null;
  total_spend?: number;
}

export interface FleetVehicle {
  id: number;
  fleet_company_id: number;
  vehicle_id: number;
  driver_user_id: number | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  driver_name?: string;
}

export interface FleetBillingConfig {
  id: number;
  fleet_company_id: number;
  invoice_frequency: FleetInvoiceFrequency;
  auto_invoice: boolean;
  default_po_number: string | null;
  billing_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FleetDashboard {
  company_id: number;
  company_name: string;
  vehicle_count: number;
  overdue_count: number;
  upcoming_due_count: number;
  last_service_date: string | null;
  total_spend: number;
}

export interface FleetDueSoonEntry {
  vehicle_id: number;
  fleet_company_id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  driver_name: string | null;
  last_service_date: string | null;
  last_service_mileage: number | null;
  due_status: "overdue" | "due_soon" | "on_track";
  days_until_due: number | null;
}

export interface ShieldInspectionSchedule {
  id: number;
  franchise_id: number;
  cadence_days: number;
  due_day_of_month: number;
  required_categories: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShieldInspection {
  id: number;
  franchise_id: number;
  schedule_id: number | null;
  submitted_by: number | null;
  period_start: string;
  period_end: string;
  status: ShieldInspectionStatus;
  overall_score: number | null;
  reviewer_id: number | null;
  reviewer_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  items?: ShieldInspectionItem[];
}

export interface ShieldInspectionItem {
  id: number;
  inspection_id: number;
  category: string;
  photo_url: string;
  passed: boolean | null;
  score: number | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Certification {
  id: number;
  user_id: number;
  franchise_id: number;
  name: string;
  issuing_body: string | null;
  date_earned: string;
  expiration_date: string | null;
  status: CertificationStatus;
  document_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingModule {
  id: number;
  name: string;
  description: string | null;
  role_required: string;
  content_url: string | null;
  duration_minutes: number | null;
  is_required: boolean;
  expiry_days: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  completion?: TrainingCompletion | null;
}

export interface TrainingCompletion {
  id: number;
  module_id: number;
  user_id: number;
  completed_at: string;
  score: number | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingChecklist {
  id: number;
  name: string;
  role_target: string;
  franchise_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items?: OnboardingChecklistItem[];
}

export interface OnboardingChecklistItem {
  id: number;
  checklist_id: number;
  user_id: number;
  step_name: string;
  description: string | null;
  sort_order: number;
  completed_at: string | null;
  completed_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: number;
  franchise_id: number;
  name: string;
  service_categories: string[];
  service_area: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
  routing_priority: number;
  compliance_docs_url: string | null;
  quality_score: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Referral {
  id: number;
  franchise_id: number;
  appointment_id: number | null;
  partner_id: number | null;
  flagged_by: number;
  fleet_rep_id: number | null;
  status: ReferralStatus;
  category: string;
  notes: string | null;
  photo_urls: string[];
  routing_mode: ReferralRoutingMode;
  created_at: string;
  updated_at: string;
  partner_name?: string;
  customer_name?: string;
}

export interface ReferralEvent {
  id: number;
  referral_id: number;
  from_status: ReferralStatus;
  to_status: ReferralStatus;
  actor_id: number | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerServiceHistoryEntry {
  id: number;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  completed_at: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  technician_name: string | null;
  services: string[];
}

export interface CustomerDetailResponse {
  customer: {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    profile_image_url: string | null;
    created_at: string;
  };
  vehicles: {
    id: number;
    vin: string;
    year: number;
    make: string;
    model: string;
    engine: string;
    license_plate: string;
    license_plate_state: string;
    color: string;
    mileage: number;
  }[];
  addresses: {
    address_line: string;
    city: string;
    state: string;
    zip: string;
    address_type: string;
    is_default: boolean;
  }[];
  serviceHistory: CustomerServiceHistoryEntry[];
  ratings: {
    emoji_score: string;
    numeric_score: number;
    comment: string | null;
    created_at: string;
  }[];
  stats: {
    totalAppointments: number;
    totalSpent: number;
    memberSince: string;
  };
}

export interface ReferralPayout {
  id: number;
  referral_id: number;
  amount: number;
  currency: string;
  status: ReferralPayoutStatus;
  paid_at: string | null;
  stripe_transfer_id: string | null;
  created_at: string;
  updated_at: string;
}

// --- Daily Briefing ---

export interface RouteSummary {
  total_distance_km: number;
  total_drive_minutes: number;
  first_stop_time: string | null;
  last_stop_time: string | null;
  stop_count: number;
}

export interface MaterialRequirement {
  item_name: string;
  item_sku: string | null;
  quantity_needed: number;
  unit: string;
  in_stock: boolean;
  current_stock: number;
}

export interface WorkloadSummary {
  job_count: number;
  estimated_service_minutes: number;
  estimated_drive_minutes: number;
  estimated_finish_time: string | null;
}

export interface BriefingAlert {
  type: "missing_inventory" | "pinned_note" | "weather" | "schedule_conflict";
  severity: "info" | "warning" | "critical";
  message: string;
  reference_id?: number;
}

export interface DailyBriefing {
  id: number;
  technician_id: number;
  briefing_date: string;
  job_count: number;
  route_summary: RouteSummary | null;
  material_requirements: MaterialRequirement[] | null;
  workload_summary: WorkloadSummary | null;
  alerts: BriefingAlert[] | null;
  computed_at: string;
  created_at: string;
  updated_at: string;
}

// --- Franchise Daily Briefing ---

export type FranchiseRouteStatus = "not_started" | "in_progress" | "completed";

export interface FranchiseTechnicianSummary {
  technician_id: number;
  technician_name: string;
  job_count: number;
  route_status: FranchiseRouteStatus;
  estimated_service_minutes: number;
  estimated_drive_minutes: number;
  stop_count: number;
  has_material_issues: boolean;
}

export interface FranchiseAggregateRoute {
  total_stops: number;
  total_distance_km: number;
  total_drive_minutes: number;
  earliest_start_time: string | null;
  latest_end_time: string | null;
}

export interface FranchiseMaterialShortage {
  item_name: string;
  item_sku: string | null;
  quantity_needed: number;
  current_stock: number;
  affected_technician_ids: number[];
  affected_technician_names: string[];
}

export interface FranchiseBriefing {
  franchise_id: number;
  briefing_date: string;
  total_job_count: number;
  total_revenue_estimate_cents: number | null;
  technician_count: number;
  technician_summaries: FranchiseTechnicianSummary[];
  aggregate_route: FranchiseAggregateRoute;
  material_shortages: FranchiseMaterialShortage[];
  alerts: BriefingAlert[];
  computed_at: string;
}

// --- Job Timer ---

export type TimerStatus = "on_track" | "tight" | "running_late";

export interface JobTimerState {
  appointment_id: number;
  service_started_at: string;
  scheduled_duration_min: number;
  elapsed_min: number;
  remaining_min: number;
  status: TimerStatus;
  lateness_notified_at: string | null;
}

export interface LeaveByData {
  next_stop_customer_name: string | null;
  next_stop_scheduled_time: string | null;
  travel_minutes: number | null;
  leave_by_time: string | null;
  minutes_until_leave: number | null;
  is_behind: boolean;
}

export interface TimerEvent {
  id: number;
  appointment_id: number;
  event_type: string;
  elapsed_minutes: number;
  notes: string | null;
  created_at: string;
}

// --- Customer Preferences ---

export interface CustomerPreferences {
  preferred_time_of_day: string | null;
  preferred_days: string[] | null;
  communication_mode: string | null;
  same_technician_preferred: boolean | null;
  no_go_times: string[] | null;
  service_behavior: string | null;
  access_instructions: string | null;
}

export interface VehiclePreferences {
  vehicle_id: number;
  parking_preference: string | null;
  vehicle_orientation: string | null;
  known_quirks: string | null;
}

export interface CustomerPreferencesResponse {
  customer: CustomerPreferences;
  vehicles: VehiclePreferences[];
}

// --- Exception Alerts ---

export type AlertSeverity = "info" | "warning" | "critical";

export interface ExceptionAlert {
  id: number;
  appointment_id: number;
  severity: AlertSeverity;
  message: string;
  alert_type: string;
}

// --- Technician Metrics ---

export interface TechnicianMetric {
  tech_id: number;
  tech_name: string;
  next_stop: string | null;
  eta: string | null;
  idle_minutes: number;
  behind_schedule_risk: "none" | "low" | "medium" | "high";
  completed_stops: number;
  total_stops: number;
}

// --- Technician Settings ---

export interface TechnicianSettings {
  notifications: {
    job_reminders: boolean;
    schedule_changes: boolean;
    fleet_alerts: boolean;
    message_notifications: boolean;
  };
  sounds: {
    notification_sound: boolean;
    haptic_feedback: boolean;
  };
  shift: {
    start_time: string;
    end_time: string;
    working_days: number[];
  };
  default_zone: string | null;
}

// --- Communication Threads ---

/**
 * @deprecated Legacy appointment-scoped thread shape (D2P-FE-12 era).
 * Replaced by `Conversation` (MSG-FE-TECH). Kept only to avoid an
 * unrelated breakage during the redo; remove in a follow-up cleanup
 * once nothing imports it. See
 * `docs/implementation-plans/messaging-redo-plan.md`.
 */
export interface ConversationThread {
  id: number;
  customer_id: number;
  appointment_id: number | null;
  location_id: number | null;
  created_at: string;
  updated_at: string;
}

// --- Fluid Level Tracking ---

export type FluidType =
  | "coolant"
  | "washer"
  | "brake"
  | "transmission"
  | "power_steering"
  | "differential";

export interface FluidLevelRecord {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  fluid_type: FluidType;
  measured_level: string;
  action_taken: string;
  created_at: string;
}

export interface FluidLevelInput {
  fluid_type: FluidType;
  measured_level: string;
  action_taken: string;
}

export interface FluidHistoryEntry {
  fluid_type: FluidType;
  records: FluidLevelRecord[];
}

// --- Tire Tread Tracking ---

export type TirePosition = "left_front" | "right_front" | "left_rear" | "right_rear";

export interface TireTreadRecord {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  position: TirePosition;
  depth_mm: number;
  created_at: string;
}

export interface TreadDepthInput {
  position: TirePosition;
  depth_mm: number;
}

export interface TreadHistoryEntry {
  position: TirePosition;
  records: TireTreadRecord[];
}

export interface TreadThreshold {
  state: string;
  red_below_mm: number;
  yellow_below_mm: number;
}

// --- Voice Debrief ---

export interface ParsedCategory {
  field: string;
  value: string;
  confidence: number;
}

export interface DebriefResult {
  parsed: {
    parsed_categories: ParsedCategory[];
    unclassified: string[];
  };
}

// --- Customer List ---

export type CustomerCreationSource = "walk_in" | "booked" | "referral";

export interface CustomerListItem {
  id: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  last_visit_date: string | null;
  visit_count: number;
  vehicle_makes: string[];
  has_deferred_work: boolean;
  creation_source: CustomerCreationSource;
  created_at: string;
  /**
   * 2026-05-25 — joined from `addresses` on the BE customer-list query
   * (preferring `is_default=true`, falling back to oldest). Used by
   * the Customers tab card so the tech can see WHERE the customer is
   * without tapping in. Either field is null when the customer has no
   * addresses on file (walk-in / Droptop-import-without-address).
   */
  address_line: string | null;
  address_city: string | null;
}

export type CustomerVehicleOption = CustomerDetailResponse['vehicles'][number];

// --- OEM Recommendations ---

export type InspectionResultStatus = "not_checked" | "checked_ok" | "replaced";

export interface ManufacturerRecommendation {
  id: number;
  vehicle_id: number;
  component: string;
  interval_miles: number | null;
  interval_months: number | null;
  last_checked_at: string | null;
  last_checked_result: InspectionResultStatus;
  next_due_miles: number | null;
  next_due_date: string | null;
  source: "carfax_oem" | "manual";
  created_at: string;
  updated_at: string;
}

// --- Training University ---

export interface TrainingSchool {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  course_count?: number;
  completion_pct?: number;
}

export interface TrainingCourse {
  id: number;
  school_id: number;
  title: string;
  description: string | null;
  level_required: number | null;
  module_count?: number;
  completion_pct?: number;
}

export interface TrainingLesson {
  id: number;
  module_id: number;
  title: string;
  content_url: string | null;
  lesson_type: "video" | "diagram" | "sop";
  sort_order: number;
}

export interface CertificationLevel {
  level: number;
  name: string;
  is_current: boolean;
  earned_at: string | null;
}

export interface CertificationRequirement {
  id: number;
  certification_level: number;
  requirement_type: string;
  requirement_value: number;
  current_progress: number;
  is_met: boolean;
}

export interface Quiz {
  id: number;
  module_id: number;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
}

export interface QuizAttempt {
  id: number;
  user_id: number;
  quiz_id: number;
  score: number;
  passed: boolean;
  created_at: string;
}

export interface VideoSubmission {
  id: number;
  user_id: number;
  module_id: number;
  video_url: string;
  status: "pending" | "approved" | "redo";
  reviewer_id: number | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface CoachSignoff {
  id: number;
  user_id: number;
  certification_level: number;
  coach_id: number;
  signed_at: string;
  notes: string | null;
}

// --- Franchise Dispatch Map ---

export interface MapStop {
  stopId: number;
  /**
   * LDM-WAVE-2 CHUNK-3 (`DRAG-2-PIN`) — the underlying appointment's
   * id. Needed by the franchise map's pin-drag flow so a cross-tech
   * drop can call `useReassignAppointment({ appointmentId, ... })`
   * (the existing reassign endpoint keys on appointment_id, not
   * stop_id). Same-route reorders use `stopId` via CHUNK-1's franchise
   * reorder endpoint and don't strictly need this field; exposing it
   * on every map stop keeps the cross-tech path symmetric.
   */
  appointmentId: number;
  stopOrder: number;
  lat: number | null;
  lng: number | null;
  customerName: string | null;
  addressLine: string | null;
  city: string | null;
  scheduledTime: string | null;
  /**
   * r16.19 (2026-05-21) — end of the scheduled service window. Used
   * by the franchise route map's chip tooltip to render the time as a
   * range ("5:00 PM – 6:00 PM"). Nullable because legacy appointments
   * predating the `scheduled_end_time` column may still exist; the
   * tooltip falls back to start-time-only display when this is null.
   */
  scheduledEndTime: string | null;
  serviceNames: string | null;
  status: string;
  estimatedArrival: string | null;
  actualArrival: string | null;
  /**
   * 2026-05-25 — Real-route polyline + per-leg drive time from
   * the previous stop. BE populates these via Google Routes API
   * v2 `computeRoutes` (one call per route, intermediates per
   * leg). Both null on the first stop of a route (no "from
   * previous" leg) and on legs the API couldn't compute (e.g.
   * missing geocoded lat/lng on a stop). The map falls back to a
   * straight-line polyline + no time label when these are null.
   */
  encodedPolyline: string | null;
  driveTimeFromPreviousMin: number | null;
}

export interface MapRoute {
  routeId: number;
  technicianId: number;
  technicianName: string;
  status: string;
  startLat: number | null;
  startLng: number | null;
  estimatedDistanceKm: number | null;
  estimatedDurationMin: number | null;
  stops: MapStop[];
}

export interface FranchiseRouteMapData {
  date: string;
  routes: MapRoute[];
  technicianLocations: (TechnicianLocation & { full_name: string })[];
}

// --- Batch 24: Deferred Service Pipeline ---

export interface DeferredWorkItem {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  customer_id: number;
  technician_id: number | null;
  observation_type: ObservationType;
  severity: Severity;
  technician_notes: string | null;
  photo_url: string | null;
  recommended_service_id: number | null;
  estimated_cost: number | null;
  status: DeferredWorkItemStatus;
  communicated_at: string | null;
  scheduled_appointment_id: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  service_name?: string | null;
}

export interface DeferredWorkItemCreatePayload {
  appointment_id: number;
  vehicle_id: number;
  customer_id: number;
  observation_type: ObservationType;
  severity: Severity;
  notes?: string;
  photo_url?: string;
  recommended_service_id?: number;
  estimated_cost?: number;
}

export interface FleetHealthDashboard {
  vehicle_count: number;
  avg_health_score: number;
  vehicles_below_threshold: number;
  total_unresolved_deferred: number;
}

export interface FleetDeferredSummary {
  observation_type: ObservationType;
  count: number;
  total_estimated_cost: number;
}

export interface FleetOutreachTarget {
  vehicle_id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  driver_name: string | null;
  health_score: number | null;
  unresolved_deferred_count: number;
}

// --- Fleet Booking ---

export interface FleetBookingInput {
  vehicle_id: number;
  service_ids: number[];
  preferred_date?: string;
  preferred_time?: string;
  notes?: string;
}

// --- MAXI Shuttle ---

export interface ShuttleOrder {
  id: number;
  franchise_id: number;
  fleet_company_id: number;
  vehicle_id: number;
  partner_id: number | null;
  deferred_work_item_id: number | null;
  status: ShuttleStatus;
  priority: ShuttlePriority;
  pickup_address_id: number | null;
  pickup_notes: string | null;
  destination_notes: string | null;
  service_description: string;
  service_ids: number[] | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  assigned_driver_id: number | null;
  pickup_at: string | null;
  delivered_to_shop_at: string | null;
  shop_service_status: ShopServiceStatus | null;
  shop_started_at: string | null;
  shop_completed_at: string | null;
  shop_notes: string | null;
  return_pickup_at: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  fleet_company_name?: string;
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_license_plate?: string;
  partner_name?: string;
  driver_name?: string;
}

export interface ShuttleStatusLogEntry {
  id: number;
  shuttle_order_id: number;
  from_status: ShuttleStatus | null;
  to_status: ShuttleStatus;
  actor_id: number | null;
  notes: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
  actor_name?: string;
}

export interface ShuttleDashboard {
  active_orders: number;
  in_transit: number;
  in_service: number;
  returning: number;
  completed_this_week: number;
  avg_turnaround_hours: number | null;
}

export interface CreateShuttleOrderInput {
  franchise_id: number;
  fleet_company_id: number;
  vehicle_id: number;
  service_description: string;
  partner_id?: number;
  deferred_work_item_id?: number;
  priority?: ShuttlePriority;
  pickup_address_id?: number;
  pickup_notes?: string;
  destination_notes?: string;
  service_ids?: number[];
  estimated_cost?: number;
}

// --- Reputation / Performance Dashboard ---

export interface RatingCategoryScore {
  category: "quality" | "timeliness" | "professionalism";
  score: number;
  team_average: number;
}

export interface BadgeProgress {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  progress: number;
  target: number;
  earned_at?: string | null;
}

export interface RatingTrend {
  period: string;
  score: number;
}

export interface TechPerformance {
  overall_rating: number;
  total_reviews: number;
  team_average_rating: number;
  categories: RatingCategoryScore[];
  trends: RatingTrend[];
  badges: BadgeProgress[];
  rank: number | null;
  team_size: number | null;
}

// --- Team Wellness (Franchise Owner) ---

export interface TeamWellnessTrend {
  date: string;
  average_mood: number;
  checkin_count: number;
}

export interface TeamWellnessFlag {
  id: string;
  type: "declining_mood" | "low_participation" | "persistent_low";
  message: string;
  severity: "warning" | "critical";
  triggered_at: string;
}

export interface TeamWellnessResponse {
  period_start: string;
  period_end: string;
  team_size: number;
  total_checkins: number;
  completion_rate: number;
  average_mood: number;
  mood_distribution: Record<number, number>;
  trends: TeamWellnessTrend[];
  flags: TeamWellnessFlag[];
}

// --- Training XP & Gamification ---

export interface TrainingXPEntry {
  module_id: number;
  module_name: string;
  xp_earned: number;
  completed_at: string;
}

export interface TrainingBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "training" | "certification" | "streak" | "mastery";
  earned: boolean;
  earned_at: string | null;
}

export interface CertificationMilestone {
  level: number;
  name: string;
  xp_required: number;
  is_reached: boolean;
}

export interface TrainingXPSummary {
  total_xp: number;
  current_level: number;
  current_level_name: string;
  xp_to_next_level: number;
  xp_in_current_level: number;
  modules_completed: number;
  recent_xp: TrainingXPEntry[];
  badges: TrainingBadge[];
  milestones: CertificationMilestone[];
}

// --- Substitution & Stock Alerts ---

export interface SubstitutePart {
  item_id: number;
  item_name: string;
  item_sku: string;
  compatibility_note: string | null;
  available_quantity: number;
  location_id: number;
  location_name: string;
  price_difference: number;
}

export interface StockCheckResult {
  item_id: number;
  item_name: string;
  item_sku: string;
  required_quantity: number;
  available_quantity: number;
  status: "in_stock" | "low" | "out_of_stock";
  substitutes: SubstitutePart[];
}

export interface JobStockCheck {
  appointment_id: number;
  items: StockCheckResult[];
  has_issues: boolean;
}

// --- White-Label Theme ---

export interface FranchiseThemeColors {
  primary: string;
  primary_light: string;
  primary_dark: string;
  secondary: string;
  secondary_light: string;
  accent: string;
  header_bg: string;
  header_text: string;
  tab_active: string;
  tab_inactive: string;
  tab_bar_bg: string;
  status_bar_style: "light" | "dark";
}

export interface FranchiseThemeFonts {
  heading: string | null;
  body: string | null;
}

export interface FranchiseTheme {
  franchise_id: number;
  brand_name: string;
  logo_url: string | null;
  icon_url: string | null;
  colors: FranchiseThemeColors;
  fonts: FranchiseThemeFonts;
  updated_at: string;
}

// --- Sound Design System ---

export type SoundEventType =
  | "new_job"
  | "job_complete"
  | "rating_received"
  | "message_received"
  | "milestone_unlocked";

export interface SoundPreferences {
  master_enabled: boolean;
  events: Record<SoundEventType, boolean>;
}

// --- Training Module Consumption (03.02) ---

export type LessonContentType = "video" | "diagram" | "sop" | "assessment";

export interface LessonContent {
  id: number;
  module_id: number;
  title: string;
  content_type: LessonContentType;
  content_url: string | null;
  content_body: string | null;
  duration_minutes: number | null;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  options: string[];
}

export interface AssessmentDetail {
  id: number;
  module_id: number;
  title: string;
  passing_score: number;
  question_count: number;
  questions: AssessmentQuestion[];
  time_limit_minutes: number | null;
  max_attempts: number | null;
  attempts_used: number;
}

export interface AssessmentResult {
  score: number;
  passed: boolean;
  correct_answers: Record<string, number>;
  feedback: string | null;
}

export interface TrainingModuleDetail {
  id: number;
  title: string;
  description: string | null;
  school_name: string;
  course_name: string;
  duration_minutes: number | null;
  xp_reward: number;
  is_mandatory: boolean;
  due_date: string | null;
  progress_pct: number;
  lessons_completed: number;
  lessons_total: number;
  lessons: LessonContent[];
  assessment: AssessmentDetail | null;
  last_position: { lesson_id: number; timestamp_seconds: number } | null;
}

// --- Assigned Training (03.03) ---

export type AssignedTrainingStatus = "assigned" | "in_progress" | "completed" | "overdue";

export interface AssignedTrainingItem {
  id: number;
  module_id: number;
  title: string;
  school_name: string;
  description: string | null;
  is_mandatory: boolean;
  due_date: string | null;
  assigned_at: string;
  status: AssignedTrainingStatus;
  progress_pct: number;
  xp_reward: number;
  duration_minutes: number | null;
  reassign_reason: string | null;
}

export interface AssignedTrainingResponse {
  items: AssignedTrainingItem[];
  mandatory_count: number;
  overdue_count: number;
}

// --- Certification Progress (03.05) ---

export interface CompetencyProgress {
  competency: string;
  score_pct: number;
  jobs_completed: number;
  jobs_required: number;
}

export interface CertificationUnlock {
  label: string;
  type: "job_type" | "pay_tier" | "feature";
  description: string | null;
}

export interface CertificationProgressResponse {
  current_level: number;
  current_level_name: string;
  current_badge_emoji: string;
  next_level: number | null;
  next_level_name: string | null;
  competencies: CompetencyProgress[];
  unlocked: CertificationUnlock[];
  next_unlocks: CertificationUnlock[];
  current_pay_tier: string | null;
  next_pay_tier: string | null;
}

// --- Certification Standing (03.06) ---

export interface StandingMetric {
  metric: string;
  current_value: number;
  threshold: number;
  is_below: boolean;
  affected_skill: string | null;
  recovery_module_id: number | null;
  recovery_module_name: string | null;
}

export interface CertificationStandingResponse {
  status: "good" | "at_risk" | "action_required";
  message: string;
  metrics: StandingMetric[];
  required_training: Array<{
    module_id: number;
    module_name: string;
    reason: string;
    due_date: string | null;
  }>;
}

/**
 * Phase 4 Chunk 4.5 — error payload shape returned by the BE's
 * `POST /api/v1/technician/orders/export-receipts` endpoint when one
 * or more selected appointment IDs fail validation.
 *
 * The BE (Chunk 4.4 — REMIBackend PR #121, squash `99c39c5`) constructs
 * each `AppError(<status>, <message>, { <offending-ids-key>: number[] })`
 * with one of three structured keys depending on the rejection cause:
 *
 *   - 404 `missing_ids`       — IDs that don't exist in the `appointments` table
 *   - 403 `cross_franchise_ids` — IDs owned by a different franchise than the caller
 *   - 400 `non_paid_ids`      — IDs whose `status` is not `'paid'`
 *
 * The payload lands at `axiosError.response.data.data` (data inside data —
 * the outer `data` is the `ApiResponse` envelope's payload slot, and
 * `errorHandler.ts` in the BE writes the `AppError.details` object into
 * that slot when responding with a non-2xx). Consumers narrow defensively
 * via the `summarizeReceiptExportErrors` helper, never as a typed envelope.
 */
export interface ReceiptExportErrorPayload {
  missing_ids?: number[];
  cross_franchise_ids?: number[];
  non_paid_ids?: number[];
}
