export const UserRole = {
  CUSTOMER: "customer",
  TECHNICIAN: "technician",
  FRANCHISE_OWNER: "franchise_owner",
  DISPATCHER: "dispatcher",
  FRANCHISOR: "franchisor",
  ADMINISTRATOR: "administrator",
  FLEET_MANAGER: "fleet_manager",
  FLEET_DRIVER: "fleet_driver",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  BANNED: "banned",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AppointmentStatus = {
  CREATED: "created",
  CONFIRMED: "confirmed",
  ACCEPTED: "accepted",
  EN_ROUTE: "en_route",
  ARRIVED: "arrived",
  IN_PROGRESS: "in_progress",
  WRAP_UP: "wrap_up",
  COMPLETED: "completed",
  PAID: "paid",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
} as const;

export type AppointmentStatus =
  (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const AppointmentServiceStatus = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

export type AppointmentServiceStatus =
  (typeof AppointmentServiceStatus)[keyof typeof AppointmentServiceStatus];

export const LineItemType = {
  PART: "part",
  FLUID: "fluid",
  LABOR: "labor",
  FEE: "fee",
  DISCOUNT: "discount",
} as const;

export type LineItemType = (typeof LineItemType)[keyof typeof LineItemType];

export const InventoryReasonCode = {
  RECEIVE_STOCK: "receive_stock",
  TRANSFER_IN: "transfer_in",
  TRANSFER_OUT: "transfer_out",
  RESERVE_FOR_JOB: "reserve_for_job",
  RELEASE_RESERVATION: "release_reservation",
  CONSUME_ON_COMPLETE: "consume_on_complete",
  ADJUSTMENT: "adjustment",
  CYCLE_COUNT_CORRECTION: "cycle_count_correction",
  WASTE_ADDED: "waste_added",
} as const;

export type InventoryReasonCode =
  (typeof InventoryReasonCode)[keyof typeof InventoryReasonCode];

export const RouteStatus = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type RouteStatus = (typeof RouteStatus)[keyof typeof RouteStatus];

export const RouteStopStatus = {
  PENDING: "pending",
  EN_ROUTE: "en_route",
  ARRIVED: "arrived",
  COMPLETED: "completed",
  SKIPPED: "skipped",
} as const;

export type RouteStopStatus =
  (typeof RouteStopStatus)[keyof typeof RouteStopStatus];

// --- Phase 4: Franchise Operations ---

export const PurchaseOrderStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  PARTIAL_RECEIVED: "partial_received",
  RECEIVED: "received",
  CANCELLED: "cancelled",
} as const;

export type PurchaseOrderStatus =
  (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const FleetPaymentTerms = {
  DUE_ON_RECEIPT: "due_on_receipt",
  NET_15: "net_15",
  NET_30: "net_30",
  NET_60: "net_60",
} as const;

export type FleetPaymentTerms =
  (typeof FleetPaymentTerms)[keyof typeof FleetPaymentTerms];

export const FleetInvoiceFrequency = {
  PER_SERVICE: "per_service",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export type FleetInvoiceFrequency =
  (typeof FleetInvoiceFrequency)[keyof typeof FleetInvoiceFrequency];

export const ShieldInspectionStatus = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type ShieldInspectionStatus =
  (typeof ShieldInspectionStatus)[keyof typeof ShieldInspectionStatus];

export const CertificationStatus = {
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const;

export type CertificationStatus =
  (typeof CertificationStatus)[keyof typeof CertificationStatus];

export const ReferralStatus = {
  DETECTED: "detected",
  OFFERED: "offered",
  ACCEPTED: "accepted",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  PAID: "paid",
  CLOSED: "closed",
  DECLINED: "declined",
  LOST: "lost",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export type ReferralStatus =
  (typeof ReferralStatus)[keyof typeof ReferralStatus];

export const ReferralRoutingMode = {
  AUTO_ROUTE: "auto_route",
  MANUAL_SELECT: "manual_select",
  BROADCAST: "broadcast",
} as const;

export type ReferralRoutingMode =
  (typeof ReferralRoutingMode)[keyof typeof ReferralRoutingMode];

export const ReferralPayoutStatus = {
  PENDING: "pending",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const;

export type ReferralPayoutStatus =
  (typeof ReferralPayoutStatus)[keyof typeof ReferralPayoutStatus];

// --- Batch 24: Deferred Service Pipeline ---

export const ObservationType = {
  DIRTY_AIR_FILTER: "dirty_air_filter",
  WORN_WIPERS: "worn_wipers",
  LOW_COOLANT: "low_coolant",
  DIRTY_TRANSMISSION_FLUID: "dirty_transmission_fluid",
  LOW_BRAKE_FLUID: "low_brake_fluid",
  TIRE_WEAR: "tire_wear",
  UNEVEN_TREAD: "uneven_tread",
  LOW_TIRE_PRESSURE: "low_tire_pressure",
  BRAKE_PAD_THIN: "brake_pad_thin",
  BRAKE_NOISE: "brake_noise",
  HEADLIGHT_OUT: "headlight_out",
  TAILLIGHT_OUT: "taillight_out",
  WINDSHIELD_DAMAGE: "windshield_damage",
  CHECK_ENGINE_LIGHT: "check_engine_light",
  BATTERY_CORROSION: "battery_corrosion",
  OIL_LEAK: "oil_leak",
  OTHER: "other",
} as const;

export type ObservationType =
  (typeof ObservationType)[keyof typeof ObservationType];

export const Severity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type Severity = (typeof Severity)[keyof typeof Severity];

export const DeferredWorkItemStatus = {
  OBSERVED: "observed",
  COMMUNICATED: "communicated",
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
  DECLINED: "declined",
  EXPIRED: "expired",
} as const;

export type DeferredWorkItemStatus =
  (typeof DeferredWorkItemStatus)[keyof typeof DeferredWorkItemStatus];

// --- MAXI Shuttle ---

export const ShuttleStatus = {
  IDENTIFIED: "identified",
  CREATED: "created",
  ASSIGNED: "assigned",
  IN_TRANSIT: "in_transit",
  IN_SERVICE: "in_service",
  RETURNING: "returning",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type ShuttleStatus =
  (typeof ShuttleStatus)[keyof typeof ShuttleStatus];

export const ShuttlePriority = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type ShuttlePriority =
  (typeof ShuttlePriority)[keyof typeof ShuttlePriority];

export const ShopServiceStatus = {
  WAITING: "waiting",
  STARTED: "started",
  IN_PROGRESS: "in_progress",
  WAITING_ON_PARTS: "waiting_on_parts",
  COMPLETE: "complete",
} as const;

export type ShopServiceStatus =
  (typeof ShopServiceStatus)[keyof typeof ShopServiceStatus];

// --- Calendar Feature ---

export const SlotType = {
  STANDARD: "standard",
  ECO: "eco",
  PRIORITY: "priority",
  FLEX_WINDOW: "flex_window",
} as const;

export type SlotType = (typeof SlotType)[keyof typeof SlotType];

export const BookingMethod = {
  MANUAL: "manual",
  GENERATED: "generated",
  BATCH: "batch",
  RECURRING: "recurring",
} as const;

export type BookingMethod = (typeof BookingMethod)[keyof typeof BookingMethod];

export const LocationType = {
  SHOP: "shop",
  CUSTOMER: "customer",
} as const;

export type LocationType = (typeof LocationType)[keyof typeof LocationType];

export const CalendarNotificationPreference = {
  EMAIL_AND_TEXT: "email_and_text",
  TEXT: "text",
  EMAIL: "email",
  NONE: "none",
} as const;

export type CalendarNotificationPreference =
  (typeof CalendarNotificationPreference)[keyof typeof CalendarNotificationPreference];

export const FlexListStatus = {
  WAITING: "waiting",
  OFFERED: "offered",
  BOOKED: "booked",
  EXPIRED: "expired",
} as const;

export type FlexListStatus =
  (typeof FlexListStatus)[keyof typeof FlexListStatus];

export const AlertType = {
  DEADHEAD: "deadhead",
  UNQUALIFIED_TECH: "unqualified_tech",
  INVENTORY_CONCERN: "inventory_concern",
  RUNNING_LATE: "running_late",
} as const;

export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export const CalendarAlertSeverity = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

export type CalendarAlertSeverity =
  (typeof CalendarAlertSeverity)[keyof typeof CalendarAlertSeverity];

export const CarfaxReportStatus = {
  PENDING: "pending",
  REPORTED: "reported",
  FAILED: "failed",
  NOT_APPLICABLE: "n/a",
} as const;

export type CarfaxReportStatus =
  (typeof CarfaxReportStatus)[keyof typeof CarfaxReportStatus];

/**
 * Phase 2 Chunk 2.1+: appointment-level CARFAX submission state.
 * Distinct from `CarfaxReportStatus` above — that one models the
 * legacy `carfax_reports` table + dry-run flow and includes "n/a";
 * this one mirrors the BE `CarfaxSubmissionStatus` enum on the
 * `appointments.carfax_status` column.
 */
export const AppointmentCarfaxStatus = {
  NOT_SUBMITTED: "not_submitted",
  PENDING: "pending",
  REPORTED: "reported",
  FAILED: "failed",
  IMPORTED_HISTORICAL: "imported_historical",
} as const;

export type AppointmentCarfaxStatus =
  (typeof AppointmentCarfaxStatus)[keyof typeof AppointmentCarfaxStatus];

/**
 * Phase 2 Chunk 2.3: per-franchise CARFAX submission cadence.
 * Drives the FO-only Settings → CARFAX toggle and the
 * `GET / PUT /franchise/settings/carfax` endpoint pair.
 */
export const CarfaxCadence = {
  EVERY_JOB: "every_job",
  NIGHTLY_BATCH: "nightly_batch",
} as const;

export type CarfaxCadence = (typeof CarfaxCadence)[keyof typeof CarfaxCadence];

export const DispatchRejectReason = {
  TOO_FAR: "too_far",
  SCHEDULE_CONFLICT: "schedule_conflict",
  MISSING_PARTS: "missing_parts",
  PERSONAL: "personal",
  OTHER: "other",
} as const;

export type DispatchRejectReason =
  (typeof DispatchRejectReason)[keyof typeof DispatchRejectReason];

export const SignalPostType = {
  TEXT: "text",
  PHOTO: "photo",
  VIDEO: "video",
  HELP_REQUEST: "help_request",
} as const;

export type SignalPostType =
  (typeof SignalPostType)[keyof typeof SignalPostType];

export const HelpRequestStatus = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
} as const;

export type HelpRequestStatus =
  (typeof HelpRequestStatus)[keyof typeof HelpRequestStatus];

export const QuickTextTemplate = {
  ARRIVAL: "arrival",
  ON_SITE: "on_site",
  AHEAD_OF_SCHEDULE: "ahead_of_schedule",
  JOB_COMPLETE: "job_complete",
} as const;

export type QuickTextTemplate =
  (typeof QuickTextTemplate)[keyof typeof QuickTextTemplate];
