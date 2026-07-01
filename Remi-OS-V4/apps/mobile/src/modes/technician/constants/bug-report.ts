export const BUG_REPORT_CONFIG = {
  ROLLING_BUFFER: {
    DEFAULT_FPS: 3,
    DEFAULT_DURATION_SECONDS: 30,
    LOW_RAM_FPS: 2,
    LOW_RAM_DURATION_SECONDS: 20,
    JPEG_QUALITY: 0.3,
    LOW_RAM_THRESHOLD_MB: 3072,
  },

  FRUSTRATION: {
    RAGE_TAP_COUNT: 3,
    RAGE_TAP_RADIUS_PT: 40,
    RAGE_TAP_WINDOW_MS: 1000,
    DEAD_END_SCROLL_BOUNCES: 3,
    DEAD_END_SCROLL_WINDOW_MS: 5000,
    RAPID_BACK_NAV_CYCLES: 3,
    RAPID_BACK_NAV_WINDOW_MS: 15000,
    ERROR_DWELL_MS: 10000,
    NUDGE_COOLDOWN_MS: 300_000, // 5 minutes
    ONE_NUDGE_PER_SESSION: true,
  },

  VOICE_MEMO: {
    MAX_DURATION_MS: 120_000, // 2 minutes
    SAMPLE_RATE: 44100,
    CHANNELS: 1,
    BIT_RATE: 128000,
    FORMAT: "m4a" as const,
  },

  SCREENSHOT_PROMPT: {
    DELAY_MS: 4500,
    VISIBLE_MS: 8000,
  },

  SESSION_RECORDING: {
    FPS: 8,
    JPEG_QUALITY: 0.5,
    HARD_TIMEOUT_MS: 300_000,
    ABANDON_EMPTY_MS: 10_000,
    ABANDON_CONTENT_MS: 30_000,
  },

  UNDO_DELAY_MS: 30_000,

  DISMISS: {
    DISABLE_SUGGESTION_COUNT: 3,
    DISABLE_SUGGESTION_WINDOW_HOURS: 48,
  },

  ASYNC_STORAGE_KEYS: {
    DRAFT: "@bug_report/draft",
    HISTORY: "@bug_report/history",
    PENDING: "@bug_report/pending",
    BUBBLE_POSITION: "@bug_report/bubble_position",
    BUBBLE_ENABLED: "@bug_report/bubble_enabled",
    BUBBLE_DISMISS_LOG: "@bug_report/bubble_dismiss_log",
    FIRST_TIME_TOOLTIP: "@bug_report/first_time_tooltip",
    SHAKE_ENABLED: "@bug_report/shake_enabled",
    SCREENSHOT_DETECTION_ENABLED: "@bug_report/screenshot_detection_enabled",
    /**
     * @deprecated Migrated to `useAccessibilityStore` (P0-FE-1).
     * Read/write via `useAccessibilityStore` instead. The migration
     * shim in that store reads this key once on first launch after
     * upgrade and then deletes it.
     * REMOVE-AFTER: v2.5.0 (along with the migration shim).
     */
    PREFERRED_HAND: "@bug_report/preferred_hand",
    SEND_DELAY: "@bug_report/send_delay",
    FRUSTRATION_EVENTS: "@bug_report/frustration_events",
    SETTINGS: "@bug_report/settings",
  },

  MAX_TEXT_DESCRIPTION: 5000,
  MAX_VOICE_TRANSCRIPT: 10000,
  MAX_SCREEN_NAME: 255,
  MAX_APP_VERSION: 50,
  MAX_DEVICE_MODEL: 100,
  MAX_OS_VERSION: 50,
  MAX_BATCH_EVENTS: 100,

  ANNOTATION: {
    COLORS: ["#EF4444", "#3B82F6", "#EAB308"] as const,
    DEFAULT_STROKE_WIDTH: 3,
  },
} as const;

export const BUG_REPORT_ROLE_DEFAULTS = {
  technician: {
    bubbleEnabled: true,
    shakeEnabled: true,
    screenshotDetectionEnabled: true,
    rollingBufferEnabled: true,
    rollingBufferFps: 3,
    rollingBufferDurationSeconds: 30,
  },
  franchise_owner: {
    bubbleEnabled: true,
    shakeEnabled: true,
    screenshotDetectionEnabled: true,
    rollingBufferEnabled: true,
    rollingBufferFps: 3,
    rollingBufferDurationSeconds: 30,
  },
} as const;

/**
 * @deprecated Moved to `src/stores/accessibility.ts` as part of P0-FE-1.
 * Import `PreferredHand` from `@technician/stores/accessibility` instead. This
 * alias is kept for now so any out-of-tree consumers (or future merge
 * conflicts) don't break, and is removed at the same cutover as the
 * migration shim.
 * REMOVE-AFTER: v2.5.0
 */
export type PreferredHand = "left" | "right";
export type SendDelay = 0 | 15 | 30 | 60;
