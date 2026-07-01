// --- Enums (mirror backend src/models/enums.ts) ---

export const BugReportStatus = {
  SUBMITTED: "submitted",
  ACKNOWLEDGED: "acknowledged",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
  WONT_FIX: "wont_fix",
} as const;

export type BugReportStatus =
  (typeof BugReportStatus)[keyof typeof BugReportStatus];

/** Local-only statuses that never reach the server */
export const LocalBugReportStatus = {
  DRAFT: "draft",
  PENDING_SEND: "pending_send",
  QUEUED: "queued",
} as const;

export type LocalBugReportStatus =
  (typeof LocalBugReportStatus)[keyof typeof LocalBugReportStatus];

export type AnyBugReportStatus = BugReportStatus | LocalBugReportStatus;

export const BugReportCategory = {
  CRASH: "crash",
  UI: "ui",
  UX: "ux",
  PERFORMANCE: "performance",
  MISC: "misc",
} as const;

export type BugReportCategory =
  (typeof BugReportCategory)[keyof typeof BugReportCategory];

export const FrustrationEventType = {
  RAGE_TAP: "rage_tap",
  DEAD_END_SCROLL: "dead_end_scroll",
  RAPID_BACK_NAV: "rapid_back_nav",
  FORM_ABANDON: "form_abandon",
  ERROR_DWELL: "error_dwell",
  REPEATED_ACTION: "repeated_action",
  SESSION_CHURN: "session_churn",
  KEYBOARD_DISMISS: "keyboard_dismiss",
  PERMISSION_DENY_RETRY: "permission_deny_retry",
} as const;

export type FrustrationEventType =
  (typeof FrustrationEventType)[keyof typeof FrustrationEventType];

export const BugReportEntryPoint = {
  SCREENSHOT: "screenshot",
  BUBBLE: "bubble",
  SHAKE: "shake",
  SETTINGS: "settings",
} as const;

export type BugReportEntryPoint =
  (typeof BugReportEntryPoint)[keyof typeof BugReportEntryPoint];

export const AttachmentType = {
  SCREENSHOT_PLAIN: "screenshot_plain",
  SCREENSHOT_ANNOTATED: "screenshot_annotated",
  SCREEN_RECORDING: "screen_recording",
  ROLLING_BUFFER: "rolling_buffer",
  VOICE_MEMO: "voice_memo",
} as const;

export type AttachmentType =
  (typeof AttachmentType)[keyof typeof AttachmentType];

export const KnownIssueStatus = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  RESOLVED: "resolved",
} as const;

export type KnownIssueStatus =
  (typeof KnownIssueStatus)[keyof typeof KnownIssueStatus];

export const AiSeverity = {
  CRITICAL: "critical",
  MAJOR: "major",
  MINOR: "minor",
  COSMETIC: "cosmetic",
} as const;

export type AiSeverity = (typeof AiSeverity)[keyof typeof AiSeverity];

export const NetworkStatus = {
  WIFI: "wifi",
  CELLULAR: "cellular",
  OFFLINE: "offline",
} as const;

export type NetworkStatus =
  (typeof NetworkStatus)[keyof typeof NetworkStatus];

export const BreadcrumbDirection = {
  PUSH: "push",
  POP: "pop",
  REPLACE: "replace",
} as const;

export type BreadcrumbDirection =
  (typeof BreadcrumbDirection)[keyof typeof BreadcrumbDirection];

// --- Interfaces (mirror backend src/models/bugReport.ts) ---

export interface BugReport {
  id: string;
  user_id: number;
  user_role: string;
  franchise_id: number | null;
  screen_name: string | null;
  app_version: string | null;
  device_model: string | null;
  os_version: string | null;
  network_status: string | null;
  entry_point: BugReportEntryPoint;
  app_type: string;
  category: BugReportCategory | null;
  text_description: string | null;
  voice_transcript: string | null;
  ai_transcript: string | null;
  ai_severity: AiSeverity | null;
  ai_module: string | null;
  ai_tags: string[];
  status: BugReportStatus;
  assigned_to: number | null;
  known_issue_id: string | null;
  resolution_note: string | null;
  submitted_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BugReportAttachment {
  id: string;
  report_id: string;
  type: AttachmentType;
  file_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface FrustrationEvent {
  id: string;
  report_id: string | null;
  user_id: number;
  franchise_id: number | null;
  type: FrustrationEventType;
  tier: number;
  screen_name: string | null;
  coordinates: { x: number; y: number } | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface NavigationBreadcrumb {
  id: string;
  report_id: string;
  screen_name: string;
  direction: BreadcrumbDirection;
  occurred_at: string;
}

export interface BugReportNote {
  id: string;
  report_id: string;
  author_id: number;
  body: string;
  created_at: string;
}

export interface KnownIssue {
  id: string;
  title: string;
  description: string | null;
  affected_screens: string[];
  status: KnownIssueStatus;
  resolved_in_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface BugReportListItem {
  id: string;
  status: BugReportStatus;
  category: BugReportCategory | null;
  screen_name: string | null;
  entry_point: BugReportEntryPoint;
  app_type: string;
  text_description: string | null;
  submitted_at: string;
  resolved_at: string | null;
  ai_severity: AiSeverity | null;
}

export interface BugReportDetail extends BugReport {
  attachments: BugReportAttachment[];
  frustration_events: FrustrationEvent[];
  breadcrumbs: NavigationBreadcrumb[];
  notes: BugReportNote[];
  known_issue: KnownIssue | null;
}

// --- Payload Types (match backend Zod schemas) ---

export interface CreateAttachmentData {
  type: AttachmentType;
  data_base64: string;
  mime_type: string;
  duration_seconds?: number;
}

export interface CreateFrustrationEventData {
  type: FrustrationEventType;
  tier: number;
  screen_name: string;
  occurred_at: string; // ISO 8601
  coordinates?: { x: number; y: number };
  metadata?: Record<string, unknown>;
}

export interface CreateBreadcrumbData {
  screen_name: string;
  direction: BreadcrumbDirection;
  occurred_at: string; // ISO 8601
}

export interface CreateBugReportPayload {
  screen_name: string;
  app_version: string;
  device_model: string;
  os_version: string;
  network_status: NetworkStatus;
  entry_point: BugReportEntryPoint;
  app_type: "technician";
  category?: BugReportCategory;
  text_description?: string;
  voice_transcript?: string;
  frustration_signals?: CreateFrustrationEventData[];
  navigation_breadcrumbs?: CreateBreadcrumbData[];
  attachments?: CreateAttachmentData[];
}

export interface UploadUrlRequest {
  filename: string;
  content_type: string;
  attachment_type: AttachmentType;
}

export interface UploadUrlResponse {
  upload_url: string;
  key: string;
}

export interface BatchFrustrationPayload {
  events: CreateFrustrationEventData[];
}

export interface BatchFrustrationResponse {
  received: number;
}

// --- Local-only types ---

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string; // ISO 8601
  context?: Record<string, unknown>;
}

export interface LocalBugReport {
  id: string;
  status: AnyBugReportStatus;
  entry_point: BugReportEntryPoint;
  category?: BugReportCategory;
  screen_name: string;
  text_description?: string;
  voice_memo_uri?: string;
  voice_memo_duration_ms?: number;
  voice_transcript?: string;
  session_recording_dir?: string;
  attachments: LocalAttachment[];
  frustration_signals: CreateFrustrationEventData[];
  navigation_breadcrumbs: CreateBreadcrumbData[];
  recent_logs: LogEntry[];
  created_at: string;
  updated_at: string;
}

export interface LocalAttachment {
  id: string;
  type: AttachmentType;
  uri: string;
  mime_type: string;
  duration_seconds?: number;
}

// --- Service interface ---

export interface BugReportServiceInterface {
  submit(report: LocalBugReport): Promise<void>;
  saveDraft(report: LocalBugReport): Promise<void>;
  loadDraft(): Promise<LocalBugReport | null>;
  deleteDraft(): Promise<void>;
  getHistory(): Promise<LocalBugReport[]>;
  getStatus(id: string): Promise<AnyBugReportStatus | null>;
  getPendingCount(): Promise<number>;
  syncPending(): Promise<void>;
}

// --- Report metrics (franchise) ---

export interface ReportMetrics {
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  total: number;
}
