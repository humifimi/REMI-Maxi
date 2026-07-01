import type {
  AppointmentStatus,
  CarfaxReportStatus,
  CertificationStatus,
  DeferredWorkItemStatus,
  DispatchRejectReason,
  HelpRequestStatus,
  ReferralStatus,
  Severity,
  ShieldInspectionStatus,
  ShuttleStatus,
  ShuttlePriority,
  SignalPostType,
  SlotType,
  CalendarAlertSeverity,
} from "@technician/types/enums";
import type { BugReportStatus, AnyBugReportStatus } from "@technician/types/bug-report";
import type { DueSoonSegment } from "@technician/types/fleet";

export const StatusColors = {
  finalized: "#22C55E",
  inProgress: "#3B82F6",
  paymentDue: "#EF4444",
  scheduled: "#EAB308",
  cancelled: "#6B7280",
} as const;

export const StatusColorMap: Record<AppointmentStatus, string> = {
  created: StatusColors.scheduled,
  confirmed: StatusColors.scheduled,
  accepted: StatusColors.scheduled,
  en_route: StatusColors.inProgress,
  arrived: StatusColors.inProgress,
  in_progress: StatusColors.inProgress,
  wrap_up: StatusColors.inProgress,
  completed: StatusColors.paymentDue,
  paid: StatusColors.finalized,
  cancelled: StatusColors.cancelled,
  no_show: "#EF4444",
};

export const StatusLabels: Record<AppointmentStatus, string> = {
  created: "Created",
  confirmed: "Confirmed",
  accepted: "Accepted",
  en_route: "En Route",
  arrived: "Arrived",
  in_progress: "In Progress",
  wrap_up: "Wrapping Up",
  completed: "Payment Due",
  paid: "Finalized",
  cancelled: "Cancelled",
  no_show: "No Show",
};

export const StatusBackgroundMap: Record<AppointmentStatus, string> = {
  created: "#FEF9C3",
  confirmed: "#FEF9C3",
  accepted: "#FEF9C3",
  en_route: "#DBEAFE",
  arrived: "#DBEAFE",
  in_progress: "#DBEAFE",
  wrap_up: "#DBEAFE",
  completed: "#FEE2E2",
  paid: "#DCFCE7",
  cancelled: "#F3F4F6",
  no_show: "#FEE2E2",
};

// --- Job Timer Status Colors ---

export type TimerStatusKey = "on_track" | "tight" | "running_late";

export const TimerStatusColors: Record<TimerStatusKey, string> = {
  on_track: "#22C55E",
  tight: "#EAB308",
  running_late: "#EF4444",
};

export const TimerStatusBg: Record<TimerStatusKey, string> = {
  on_track: "#F0FDF4",
  tight: "#FEF9C3",
  running_late: "#FEE2E2",
};

export const TimerStatusLabels: Record<TimerStatusKey, string> = {
  on_track: "On Track",
  tight: "Tight",
  running_late: "Running Late",
};

// --- Phase 4 Color Maps ---

export const ParStatusColors = {
  aboveTarget: "#22C55E",
  belowTarget: "#EAB308",
  belowMinimum: "#EF4444",
} as const;

export function getParStatusColor(
  onHand: number,
  parMin: number,
  parTarget: number
): string {
  if (onHand < parMin) return ParStatusColors.belowMinimum;
  if (onHand < parTarget) return ParStatusColors.belowTarget;
  return ParStatusColors.aboveTarget;
}

export const CertificationStatusColorMap: Record<CertificationStatus, string> =
  {
    active: "#22C55E",
    expired: "#EF4444",
    revoked: "#6B7280",
  };

export const ShieldStatusColorMap: Record<ShieldInspectionStatus, string> = {
  pending: "#EAB308",
  submitted: "#3B82F6",
  approved: "#22C55E",
  rejected: "#EF4444",
};

export const ReferralStatusColorMap: Record<ReferralStatus, string> = {
  detected: "#EAB308",
  offered: "#3B82F6",
  accepted: "#8B5CF6",
  scheduled: "#06B6D4",
  completed: "#22C55E",
  paid: "#059669",
  closed: "#6B7280",
  declined: "#9CA3AF",
  lost: "#9CA3AF",
  cancelled: "#6B7280",
  expired: "#9CA3AF",
};

export const DueStatusColorMap: Record<string, string> = {
  overdue: "#EF4444",
  due_soon: "#EAB308",
  on_track: "#22C55E",
};

// --- Fleet Due-Soon Segment Colors ---

export const DueSoonSegmentColors: Record<DueSoonSegment, string> = {
  overdue: "#EF4444",
  due_7: "#EAB308",
  due_14: "#3B82F6",
};

export const DueSoonSegmentBgColors: Record<DueSoonSegment, string> = {
  overdue: "#FEE2E2",
  due_7: "#FEF9C3",
  due_14: "#DBEAFE",
};

export const DueSoonSegmentLabels: Record<DueSoonSegment, string> = {
  overdue: "Overdue",
  due_7: "Due in 7 Days",
  due_14: "Due in 14 Days",
};

// --- Exception Alert Colors ---

export const AlertSeverityColors: Record<string, string> = {
  info: "#3B82F6",
  warning: "#F97316",
  critical: "#EF4444",
};

// --- Batch 24: Deferred Service Pipeline ---

export const SeverityColorMap: Record<Severity, string> = {
  low: "#EAB308",
  medium: "#F97316",
  high: "#EF4444",
};

export const SeverityLabels: Record<Severity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const DeferredStatusColorMap: Record<DeferredWorkItemStatus, string> = {
  observed: "#3B82F6",
  communicated: "#8B5CF6",
  scheduled: "#EAB308",
  completed: "#22C55E",
  declined: "#6B7280",
  expired: "#9CA3AF",
};

export const DeferredStatusLabels: Record<DeferredWorkItemStatus, string> = {
  observed: "Observed",
  communicated: "Communicated",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Declined",
  expired: "Expired",
};

// --- MAXI Shuttle ---

export const ShuttleStatusColorMap: Record<ShuttleStatus, string> = {
  identified: "#9CA3AF",
  created: "#EAB308",
  assigned: "#3B82F6",
  in_transit: "#8B5CF6",
  in_service: "#F97316",
  returning: "#06B6D4",
  completed: "#22C55E",
  cancelled: "#6B7280",
};

export const ShuttleStatusLabels: Record<ShuttleStatus, string> = {
  identified: "Identified",
  created: "Created",
  assigned: "Assigned",
  in_transit: "In Transit",
  in_service: "In Service",
  returning: "Returning",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ShuttlePriorityColorMap: Record<ShuttlePriority, string> = {
  low: "#9CA3AF",
  normal: "#3B82F6",
  high: "#F97316",
  urgent: "#EF4444",
};

export const ShuttlePriorityLabels: Record<ShuttlePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

// --- Bug Reporter ---

export const BugReportStatusColors: Record<BugReportStatus, string> = {
  submitted: "#3B82F6",
  acknowledged: "#8B5CF6",
  in_progress: "#F97316",
  resolved: "#22C55E",
  wont_fix: "#6B7280",
};

export const BugReportStatusBgColors: Record<BugReportStatus, string> = {
  submitted: "#DBEAFE",
  acknowledged: "#EDE9FE",
  in_progress: "#FFF7ED",
  resolved: "#DCFCE7",
  wont_fix: "#F3F4F6",
};

export const BugReportStatusLabels: Record<BugReportStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  in_progress: "In Progress",
  resolved: "Resolved",
  wont_fix: "Won't Fix",
};

export const LocalBugReportStatusColors: Record<string, string> = {
  draft: "#9CA3AF",
  pending_send: "#EAB308",
  queued: "#F97316",
};

export const LocalBugReportStatusLabels: Record<string, string> = {
  draft: "Draft",
  pending_send: "Pending",
  queued: "Queued",
};

export function getBugReportStatusColor(status: AnyBugReportStatus): string {
  return (
    (BugReportStatusColors as Record<string, string>)[status] ??
    LocalBugReportStatusColors[status] ??
    "#9CA3AF"
  );
}

export function getBugReportStatusLabel(status: AnyBugReportStatus): string {
  return (
    (BugReportStatusLabels as Record<string, string>)[status] ??
    LocalBugReportStatusLabels[status] ??
    status
  );
}

// --- CARFAX Report Status ---

export const CarfaxStatusColorMap: Record<CarfaxReportStatus, string> = {
  pending: "#EAB308",
  reported: "#22C55E",
  failed: "#EF4444",
  "n/a": "#6B7280",
};

export const CarfaxStatusBgMap: Record<CarfaxReportStatus, string> = {
  pending: "#FEF9C3",
  reported: "#DCFCE7",
  failed: "#FEE2E2",
  "n/a": "#F3F4F6",
};

export const CarfaxStatusLabels: Record<CarfaxReportStatus, string> = {
  pending: "Pending",
  reported: "Reported",
  failed: "Failed",
  "n/a": "N/A",
};

// Dry-run is not a persisted CarfaxReportStatus — it's a derived visual
// state when a row exists locally but no file was uploaded to Carfax. The
// badge renders these colors when the appointment-detail summary reports
// `dry_run: true` or `mode: "dry-run"` for a pending row.
export const CarfaxDryRunVisual = {
  fg: "#1D4ED8",
  bg: "#DBEAFE",
  label: "Dry-Run (not sent)",
} as const;

// --- Dispatch Reject Reasons ---

export const DispatchRejectReasonLabels: Record<DispatchRejectReason, string> = {
  too_far: "Too Far Away",
  schedule_conflict: "Schedule Conflict",
  missing_parts: "Missing Parts / Supplies",
  personal: "Personal Reason",
  other: "Other",
};

// --- Calendar Feature ---

export const SlotTypeColors: Record<SlotType, string> = {
  standard: "#3B82F6",
  eco: "#22C55E",
  priority: "#F59E0B",
  flex_window: "#8B5CF6",
};

export const SlotTypeBgColors: Record<SlotType, string> = {
  standard: "#EFF6FF",
  eco: "#F0FDF4",
  priority: "#FEF3C7",
  flex_window: "#F5F3FF",
};

export const SlotTypeLabels: Record<SlotType, string> = {
  standard: "Standard",
  eco: "Eco",
  priority: "Priority",
  flex_window: "Flex Window",
};

export const CalendarAlertSeverityColors: Record<
  CalendarAlertSeverity,
  string
> = {
  info: "#3B82F6",
  warning: "#F59E0B",
  critical: "#EF4444",
};

// --- Signal Feed ---

export const SignalPostTypeColors: Record<SignalPostType, string> = {
  text: "#3B82F6",
  photo: "#8B5CF6",
  video: "#F97316",
  help_request: "#EF4444",
};

export const SignalPostTypeLabels: Record<SignalPostType, string> = {
  text: "Text",
  photo: "Photo",
  video: "Video",
  help_request: "Help Request",
};

export const HelpRequestStatusColors: Record<HelpRequestStatus, string> = {
  open: "#EF4444",
  in_progress: "#F97316",
  resolved: "#22C55E",
};

export const HelpRequestStatusLabels: Record<HelpRequestStatus, string> = {
  open: "Help Requested",
  in_progress: "In Progress",
  resolved: "Resolved",
};

// --- Wellness ---

export const WellnessMoodColors: Record<number, string> = {
  5: "#22C55E",
  4: "#84CC16",
  3: "#EAB308",
  2: "#F97316",
  1: "#EF4444",
};

// --- Reorganization Session Source Badges ---
//
// Used by the Pending Reality review screen (`app/pending-reality/review.tsx`)
// to color-code the source of a session: tech-authored, FO-authored,
// customer-authored, or AI-emitted (P7-FE-1, master plan §5.2.5).
//
// The AI slot uses violet (#8B5CF6) — distinct from `StatusColors`
// (reserved for appointment status), `TECH_PALETTE` (per-tech identity),
// and the `inProgress` blue (used heavily for in-flight states). Per
// §5.5.1 the AI badge MUST stay distinct so a user can tell at a
// glance who proposed a pending change.

export const SourceBadgeColors = {
  tech_app: "#3B82F6", // blue — same family as tech in-progress
  franchise_dashboard: "#0EA5E9", // sky-500 — FO authority
  customer_app: "#22C55E", // green — customer-originated
  ai_suggestion: "#8B5CF6", // violet-500 — AI engine (§5.2.5)
} as const;

export const SourceBadgeLabels = {
  tech_app: "Tech",
  franchise_dashboard: "FO",
  customer_app: "Customer",
  ai_suggestion: "AI",
} as const;

// --- Tech Identity Palette (calendar overlay mode) ---
//
// Used by `colorForTech(techId)` (`src/utils/color-for-tech.ts`, P0-FE-2)
// to produce a deterministic per-tech color. Consumed by Phase B's
// landscape-canvas overlay mode (`P2-FE-4`, master plan §5.1.4) for
// the left border + badge pill + tint of appointment cards when 2+
// techs are multi-selected on the calendar.
//
// MUST stay disjoint from `ROUTE_PALETTE` in
// `src/components/route/franchise-route-map.tsx`. The route palette is
// keyed by *route order* (changes when techs reorder); this palette is
// keyed by *tech identity* (stable across reorder). Sharing a hex
// would let a user see the same color carry different semantics on the
// map vs. the calendar in the same glance.
//
// Curation rules — every color below satisfies all three:
//   1. The hue itself contrasts ≥ 3:1 against the light calendar bg
//      (#FFFFFF) so the border + tint reads as a colored marker.
//   2. The hue itself contrasts ≥ 3:1 against a dark-mode neutral bg
//      (~#1F2937, slate-800) so the same border + tint stays visible
//      if/when the calendar adopts a dark theme.
//   3. Each hue is in a different *family* from every other slot at
//      max saturation (red / orange / yellow / green / blue / purple
//      / brown / pink) so the palette reads as 8+ distinct categories
//      at a glance — not 8 shades of "darkish."
//
// HISTORY: an earlier palette used muted tailwind 700/800 shades
// (indigo-600, teal-700, yellow-800, lime-700, fuchsia-700, rose-700,
// sky-700, purple-700, emerald-700, amber-700). Every entry passed
// WCAG AA white-text contrast (≥ 4.5:1), but on the small avatar
// surfaces the strip uses (34pt circles), the desaturated 700/800
// shades read as ~2 color families ("dark cool" and "dark warm")
// instead of 10 distinct techs. P2-FE-4 follow-up #14 (2026-04-20)
// swapped to the vivid 400/500/600 shades below per direct user
// request: *"the colors are all soooo similar... Make the colors
// solid primary colors and solid clear different other colors like
// green, red, yellow, blue, light purple, brown, bright orange."*
//
// TRADEOFF: white text on the new vivid-yellow + light-purple slots
// no longer satisfies WCAG AA at normal text size (yellow-400 ~ 1.7:1,
// violet-400 ~ 2.4:1). Instant tech-identification at a glance is the
// higher-priority UX goal here per user feedback. Status badges that
// need to overlay text on top of the tech color should sample the hue
// and pick black or white text via a runtime contrast check — don't
// assume white is universally legible against this palette anymore.
//
// Length is chosen at 8: large enough that small franchises
// (~3–6 techs) almost never collide modulo the palette length, small
// enough that every slot stays in a clearly different hue family.
// Order is stable — `colorForTech` hashes deterministically into this
// array, so changes here re-color every tech and should be treated as
// a UX-visible change.
export const TECH_PALETTE: readonly string[] = [
  "#DC2626", // red-600 — vivid red
  "#F97316", // orange-500 — bright orange
  "#FACC15", // yellow-400 — vivid yellow
  "#16A34A", // green-600 — vivid green
  "#2563EB", // blue-600 — true blue
  "#A78BFA", // violet-400 — light purple
  "#92400E", // amber-800 — brown
  "#EC4899", // pink-500 — vivid pink (rounds out distribution)
] as const;

// --- Pending-Reality Overlay Color (cross-device staging tint) ---
//
// `PendingOverlayColors.tile` paints any appointment card with at least
// one active reorganization intent staged against it (P3-FE-8, master
// plan §3.4). The color is sampled by `applyPendingChangeBorderOverride`
// (`src/components/calendar/pending-change-overlay-style.ts`) into the
// event tile's `backgroundColor` because that's the only `StyleOverrides`
// knob the vendored library doesn't clobber via its `dynamicStyle` array
// merge — `borderStyle: "dashed"` was the original spec but it silently
// renders as solid on iOS when `borderRadius > 0` (the library's
// EventBlock uses `borderRadius: 5`), and any `borderWidth` we set is
// overridden by the library's last-wins `dynamicStyle.borderWidth = 1|2`.
// See `pending-change-overlay-style.ts` and PLAN-DEVIATIONS.md
// #2026-04-27-pending-overlay-tint for the full reasoning.
//
// Cyan-500 (#06B6D4) is the only saturated hue with a ≥ 30° hue-wheel
// gap from every entry in `TECH_PALETTE`, `StatusColors`, and
// `SourceBadgeColors`. The nearest neighbors are status-blue (#3B82F6 ~
// 217°) at ~29° and tech-green (#16A34A ~ 135°) at ~53° — both
// comfortably outside the threshold below which two hues read as "the
// same color" on a small calendar tile. Adding any new tech color, route
// color, or status color in the 165°–200° band would re-introduce the
// "card looks pending but isn't" failure mode the user warned us about.
//
// Local-vs-remote intent differentiation is signaled by the existing
// `PendingChangeBadge` icon (pencil for tech, sparkles for AI, person
// for FO, headset for customer) — see `PendingChangeBadge.tsx`. We do
// NOT use a second hue for that distinction because there is no second
// "lonely" hue with a comparable moat in the palette.
export const PendingOverlayColors = {
  tile: "#06B6D4", // cyan-500
  // White text reads ≥ 4.6:1 against cyan-500 — sufficient for body
  // copy at the small font size the calendar uses.
  text: "#FFFFFF",
} as const;

// Hues we deliberately reserve for non-tech roles. New entries in
// `TECH_PALETTE` MUST stay outside the ±30° band around each of these
// or they'll collide with status / pending / source semantics. The
// `colorForTech` hash deterministically maps onto `TECH_PALETTE`, so a
// drift inside any of these bands becomes a UX-visible regression on
// every device once shipped.
export const RESERVED_OVERLAY_HUES: readonly { name: string; hex: string; hueDegrees: number }[] = [
  { name: "PendingOverlayColors.tile", hex: "#06B6D4", hueDegrees: 188 },
  { name: "StatusColors.scheduled", hex: "#EAB308", hueDegrees: 45 },
  { name: "StatusColors.inProgress", hex: "#3B82F6", hueDegrees: 217 },
  { name: "StatusColors.finalized", hex: "#22C55E", hueDegrees: 140 },
  { name: "StatusColors.paymentDue", hex: "#EF4444", hueDegrees: 0 },
  { name: "StatusColors.cancelled", hex: "#6B7280", hueDegrees: 220 }, // saturation ~0; spectrum-position is informational
];

export const ObservationTypeLabels: Record<string, string> = {
  dirty_air_filter: "Dirty Air Filter",
  worn_wipers: "Worn Wipers",
  low_coolant: "Low Coolant",
  dirty_transmission_fluid: "Dirty Transmission Fluid",
  low_brake_fluid: "Low Brake Fluid",
  tire_wear: "Tire Wear",
  uneven_tread: "Uneven Tread",
  low_tire_pressure: "Low Tire Pressure",
  brake_pad_thin: "Thin Brake Pads",
  brake_noise: "Brake Noise",
  headlight_out: "Headlight Out",
  taillight_out: "Taillight Out",
  windshield_damage: "Windshield Damage",
  check_engine_light: "Check Engine Light",
  battery_corrosion: "Battery Corrosion",
  oil_leak: "Oil Leak",
  other: "Other",
};
