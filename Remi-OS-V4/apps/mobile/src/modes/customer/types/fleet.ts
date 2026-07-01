export type FleetRole = 'fleet_manager' | 'fleet_driver';

export type FleetAlertLevel = 'overdue' | 'due_soon' | 'pending_approval';

export type FleetActivityType =
  | 'service_completed'
  | 'booking_created'
  | 'approval_requested'
  | 'inspection_overdue'
  | 'vehicle_added';

export interface FleetAlert {
  id: number;
  level: FleetAlertLevel;
  title: string;
  subtitle: string;
  count: number;
}

export interface FleetActivityItem {
  id: number;
  type: FleetActivityType;
  description: string;
  vehicle_name: string | null;
  driver_name: string | null;
  timestamp: string;
}

export interface FleetSpendSummary {
  mtd_total: number;
  previous_month_total: number;
  ytd_total: number;
  budget_limit: number | null;
  budget_used_percent: number | null;
}

export interface FleetDriver {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  assigned_vehicle_ids: number[];
  status: 'active' | 'inactive';
}

export interface FleetDriverDetail extends FleetDriver {
  assigned_vehicles: FleetDriverVehicle[];
  inspection_compliance: string;
  inspections_on_time: number;
  inspections_total: number;
  inspections_overdue: number;
  last_inspection_date: string | null;
  service_history: FleetServiceHistoryEntry[];
}

export interface FleetDriverVehicle {
  id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  health_score: number;
}

export type FleetApprovalRequestType = 'driver_request' | 'deferred_work' | 'due_soon_suggestion';

export interface FleetApprovalRequest {
  id: number;
  fleet_company_id: number;
  vehicle_id: number;
  vehicle_name: string;
  driver_id: number | null;
  driver_name: string | null;
  requested_by: number;
  reviewed_by: number | null;
  request_type: FleetApprovalRequestType;
  service_ids: number[];
  service_description: string;
  deferred_work_item_id: number | null;
  estimated_cost: number;
  status: 'pending' | 'approved' | 'denied';
  review_note: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

export interface FleetDashboard {
  fleet_name: string;
  total_vehicles: number;
  fleet_health_score: number;
  alerts: FleetAlert[];
  spend: FleetSpendSummary;
  recent_activity: FleetActivityItem[];
  pending_approvals: number;
}

export interface FleetVehicleCard {
  id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  assigned_driver: FleetDriver | null;
  health_score: number;
  last_service_date: string | null;
  next_due_indicator: 'overdue' | 'due_soon' | 'on_track' | null;
  inspection_status: 'current' | 'due_soon' | 'overdue' | 'never';
  deferred_item_count: number;
}

export interface FleetServiceHistoryEntry {
  id: number;
  date: string;
  services: string[];
  technician_name: string | null;
  cost: number;
  status: 'completed' | 'in_progress' | 'scheduled';
}

export interface FleetDeferredItem {
  id: number;
  observation_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  technician_notes: string | null;
  estimated_cost: number | null;
  recommended_service: string | null;
  created_at: string;
}

export interface FleetInspectionEntry {
  id: number;
  date: string;
  driver_name: string | null;
  score: number;
  flagged_items: number;
  status: 'passed' | 'flagged' | 'failed';
}

export interface FleetDueSoonItem {
  id: number;
  service_name: string;
  component: string;
  due_date: string | null;
  due_mileage: number | null;
  days_remaining: number | null;
  miles_remaining: number | null;
  urgency: 'overdue' | 'urgent' | 'upcoming' | 'on_track';
}

export interface FleetVehicleDetail {
  id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  vin: string | null;
  photo_url: string | null;
  health_score: number;
  health_components: {
    oil: number;
    tires: number;
    brakes: number;
    filters: number;
    wipers: number;
    fluids: number;
  };
  assigned_driver: FleetDriver | null;
  service_history: FleetServiceHistoryEntry[];
  deferred_items: FleetDeferredItem[];
  inspection_history: FleetInspectionEntry[];
  due_soon: FleetDueSoonItem[];
}

export type ComplianceTimePeriod = 30 | 60 | 90;

export interface FleetDriverCompliance {
  driver_id: number;
  driver_name: string;
  inspections_on_time: number;
  inspections_total: number;
  compliance_rate: number;
  last_inspection_date: string | null;
}

export interface FleetComplianceEnhanced {
  fleet_compliance_score: number;
  total_vehicles: number;
  inspected_count: number;
  overdue_count: number;
  due_soon_count: number;
  outstanding_service_items: number;
  completion_rate: number;
  trend: { month: string; score: number }[];
  overdue_vehicles: FleetComplianceVehicle[];
  due_soon_vehicles: FleetComplianceVehicle[];
  driver_leaderboard: FleetDriverCompliance[];
}

export interface FleetComplianceVehicle {
  vehicle_id: number;
  vehicle_name: string;
  license_plate: string | null;
  assigned_driver: string | null;
  health_score: number;
  days_overdue: number;
  last_inspection_date: string | null;
  inspection_status: 'current' | 'due_soon' | 'overdue' | 'never';
  outstanding_service_items: number;
}

// ---------------------------------------------------------------------------
// Fleet Booking
// ---------------------------------------------------------------------------

export interface FleetBookingRequest {
  vehicle_id: number;
  service_ids: number[];
  address_id: number;
  scheduled_date: string;
  scheduled_time: string;
  po_number?: string;
  notes?: string;
}

export interface FleetBatchBookingRequest {
  vehicle_ids: number[];
  service_ids: number[];
  address_id: number;
  scheduled_date: string;
  scheduled_time: string;
  po_number?: string;
  notes?: string;
}

export interface FleetBookingResponse {
  appointment_id: number;
  vehicle_id: number;
  vehicle_name: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
}

export interface FleetBatchBookingResponse {
  bookings: FleetBookingResponse[];
  total_created: number;
}

// ---------------------------------------------------------------------------
// Fleet Approval Review
// ---------------------------------------------------------------------------

export interface FleetApprovalReviewRequest {
  action: 'approve' | 'deny';
  review_note?: string;
}

// ---------------------------------------------------------------------------
// Driver Service Request
// ---------------------------------------------------------------------------

export interface DriverServiceRequestPayload {
  vehicle_id: number;
  service_ids: number[];
  note?: string;
}

// ---------------------------------------------------------------------------
// Fleet Spend & Budget
// ---------------------------------------------------------------------------

export type SpendPeriod = 'monthly' | 'quarterly';

export interface FleetSpendByVehicle {
  vehicle_id: number;
  vehicle_name: string;
  total: number;
}

export interface FleetSpendByServiceType {
  service_type: string;
  total: number;
  percentage: number;
}

export interface FleetSpendTrendPoint {
  month: string;
  total: number;
}

export interface FleetSpendData {
  mtd_total: number;
  previous_month_total: number;
  ytd_total: number;
  budget_limit: number | null;
  budget_period: SpendPeriod | null;
  budget_used_percent: number | null;
  by_vehicle: FleetSpendByVehicle[];
  by_service_type: FleetSpendByServiceType[];
  trend: FleetSpendTrendPoint[];
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue';

export interface FleetInvoice {
  id: number;
  date: string;
  amount: number;
  po_number: string | null;
  vehicle_names: string[];
  status: InvoiceStatus;
  description: string;
}

export interface FleetBudgetUpdate {
  budget_limit: number;
  budget_period: SpendPeriod;
}

// ---------------------------------------------------------------------------
// Fleet Settings
// ---------------------------------------------------------------------------

export type NotificationRecipient = 'manager_only' | 'manager_and_drivers';

export type InspectionFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface FleetSettings {
  company_name: string;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_contact_phone: string | null;
  default_po_number: string | null;
  po_required: boolean;
  notification_recipient: NotificationRecipient;
  inspection_frequency: InspectionFrequency;
  budget_target: number | null;
  budget_period: SpendPeriod | null;
  auto_approval_threshold: number | null;
}

export interface FleetSettingsUpdate {
  default_po_number?: string | null;
  po_required?: boolean;
  notification_recipient?: NotificationRecipient;
  inspection_frequency?: InspectionFrequency;
  budget_target?: number | null;
  budget_period?: SpendPeriod | null;
  auto_approval_threshold?: number | null;
}

// ---------------------------------------------------------------------------
// Fleet Inspections (Manager View)
// ---------------------------------------------------------------------------

export type InspectionCheckResult = 'pass' | 'flag';

export interface InspectionChecklistItem {
  key: string;
  label: string;
  category: string;
  result: InspectionCheckResult | null;
  photo_url: string | null;
  note: string | null;
}

export interface FleetInspectionDetail {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  license_plate: string | null;
  driver_id: number | null;
  driver_name: string | null;
  submitted_at: string;
  score: number;
  flagged_items: number;
  total_items: number;
  status: 'passed' | 'flagged' | 'failed';
  checklist: InspectionChecklistItem[];
  voice_note_url: string | null;
}

export interface PendingInspectionVehicle {
  vehicle_id: number;
  vehicle_name: string;
  license_plate: string | null;
  driver_id: number | null;
  driver_name: string | null;
  last_inspection_date: string | null;
  days_overdue: number;
  inspection_frequency: InspectionFrequency;
}

export interface FleetInspectionsData {
  recent: FleetInspectionDetail[];
  pending: PendingInspectionVehicle[];
}

// ---------------------------------------------------------------------------
// Fleet Inspection Template (Driver Self-Inspection)
// ---------------------------------------------------------------------------

export interface InspectionTemplateItem {
  key: string;
  label: string;
  category: string;
  description: string;
  icon: string;
}

export interface InspectionTemplate {
  items: InspectionTemplateItem[];
  vehicle_id: number | null;
  vehicle_name: string | null;
}

export interface InspectionSubmissionItem {
  key: string;
  result: InspectionCheckResult;
  photo_uri: string | null;
}

export interface InspectionSubmissionPayload {
  vehicle_id: number;
  items: InspectionSubmissionItem[];
  voice_note_uri: string | null;
}

export interface InspectionSubmissionResponse {
  inspection_id: number;
  score: number;
  flagged_items: number;
  status: 'passed' | 'flagged' | 'failed';
}

// ---------------------------------------------------------------------------
// Fleet Shuttle Tracking
// ---------------------------------------------------------------------------

export type ShuttleStatus = 'pickup' | 'in_transit' | 'in_service' | 'returning' | 'completed';

export interface ShuttleLocation {
  latitude: number;
  longitude: number;
  heading: number | null;
  updated_at: string;
}

export interface ShuttleAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number | null;
  longitude: number | null;
}

export interface FleetShuttleData {
  id: number;
  appointment_id: number;
  vehicle_id: number;
  vehicle_name: string;
  status: ShuttleStatus;
  driver_name: string;
  driver_phone: string | null;
  pickup_address: ShuttleAddress;
  delivery_address: ShuttleAddress;
  partner_shop_name: string | null;
  partner_shop_phone: string | null;
  eta_minutes: number | null;
  location: ShuttleLocation | null;
  timeline: ShuttleTimelineEntry[];
}

export interface ShuttleTimelineEntry {
  status: ShuttleStatus;
  label: string;
  timestamp: string | null;
  is_current: boolean;
}

// ---------------------------------------------------------------------------
// Fleet Driver Experience
// ---------------------------------------------------------------------------

export interface FleetDriverVehicleInfo {
  vehicle_id: number;
  vehicle_name: string;
  license_plate: string | null;
  health_score: number;
  next_due_service: string | null;
  next_due_date: string | null;
  inspection_status: 'current' | 'due_soon' | 'overdue' | 'never';
  last_inspection_date: string | null;
}
