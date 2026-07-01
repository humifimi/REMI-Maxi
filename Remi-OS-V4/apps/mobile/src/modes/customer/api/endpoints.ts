export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    REFRESH: '/auth/refresh',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    LOGOUT: '/auth/logout',
    // @demo-start
    DEMO_LOGIN: '/auth/demo-login',
    DEMO_RESET: '/demo/reset',
    // @demo-end
  },
  PROFILE: {
    GET: '/profile',
    UPDATE: '/profile',
  },
  VEHICLES: {
    LIST: '/vehicles',
    ADD: '/vehicles',
    UPDATE: (id: number) => `/vehicles/${id}` as const,
    // @demo-start
    DELETE: (id: number) => `/vehicles/${id}` as const,
    // @demo-end
    HEALTH: (id: number) => `/health/vehicles/${id}/health-score` as const,
    HEALTH_COMPOSITE: (id: number) => `/vehicles/${id}/health` as const,
    SCAN: '/vehicles/scan',
    DECODE: '/vehicles/decode',
    DECODE_PLATE: '/vehicles/decode-plate',
    TREAD_HISTORY: (vehicleId: number) => `/vehicles/${vehicleId}/tread-history` as const,
    FLUID_HISTORY: (vehicleId: number) => `/vehicles/${vehicleId}/fluid-history` as const,
    RECOMMENDATIONS: (vehicleId: number) => `/vehicles/${vehicleId}/recommendations` as const,
    CARFAX_EXPORT: (vehicleId: number) => `/vehicles/${vehicleId}/carfax-export` as const,
  },
  APPOINTMENTS: {
    LIST: '/appointments',
    /**
     * Legacy direct-mutation routes. As of P5-CU-3, the customer app
     * mints a `reorganization_session` instead (see `REORGANIZATIONS` below).
     * These constants are kept so the @demo fallback inside
     * `useRescheduleAppointment` / `useCancelAppointment` still has a
     * back-channel target if/when the demo path needs to go to the
     * legacy endpoint, and so any direct callers in older docs/scripts
     * still resolve. New mutation paths must use `REORGANIZATIONS.CREATE`.
     */
    RESCHEDULE: (id: number) => `/appointments/${id}/reschedule` as const,
    CANCEL: (id: number) => `/appointments/${id}/cancel` as const,
    ADD_SERVICE: (id: number) => `/appointments/${id}/add-service` as const,
    SERVICE_RECORD: (id: number) => `/appointments/${id}/service-record` as const,
  },
  REORGANIZATIONS: {
    /**
     * Customer-side single-intent session mint endpoint.
     * Master plan §6.1 / §6.2 — takes `Idempotency-Key` header and a
     * `{ initial_intents, finalize_immediately }` body.
     */
    CREATE: '/reorganizations',
    /**
     * Customer-facing list of reorganization sessions affecting the
     * authenticated customer's appointments. Master plan §5.4.2 / §6.2.
     * Caller filters by `?status=pending_review` to drive the approval
     * inbox surface (P5-CU-2). Server filters the response to the
     * `CustomerVisibleSession` shape — `reassign`, `create`, and
     * personal-event intents are stripped server-side per §3.8.4.
     */
    LIST: '/reorganizations',
    /**
     * Per-session detail used by the approval action sheet (P5-CU-5).
     * Master plan §6.2 — returns the same `CustomerVisibleSession` shape
     * scrubbed of non-customer-visible intent kinds (§3.8.4). The audit
     * trail is included on this endpoint (unlike the LIST one), so the
     * action sheet can show "Tech proposed at 2:01 PM" timestamps.
     */
    DETAIL: (sessionId: number) => `/reorganizations/${sessionId}` as const,
    /**
     * Customer respond endpoint (P5-CU-5). Master plan §6.1 / §6.2 —
     * collapses approve/deny into one ergonomic POST keyed off
     * `body.action` ('approve' | 'decline'). Takes `Idempotency-Key`
     * header per §6.3.
     *
     * PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape — the
     * §8.9 Prompt D.5 chunk-prompt body says POST `.../approve` and
     * `.../deny` (matching the franchise family). The actual customer
     * family ships `/respond` per the §6.2 spec body (verified against
     * REMIBackend/src/routes/v1/customer/reorganizations.ts). Spec body
     * wins per the deviation rule; see
     * docs/PLAN-DEVIATIONS.md#2026-05-02-customer-respond-endpoint-shape.
     */
    RESPOND: (sessionId: number) =>
      `/reorganizations/${sessionId}/respond` as const,
    /**
     * Customer counter-propose endpoint (P5-CU-5). Master plan §6.1 /
     * §6.2 — mints a new draft session with `related_session_id` set to
     * the original. Takes `{ initial_intents }` body and an
     * `Idempotency-Key` header.
     */
    COUNTER_PROPOSE: (sessionId: number) =>
      `/reorganizations/${sessionId}/counter-propose` as const,
  },
  WAITLIST: {
    JOIN: '/waitlist',
    STATUS: '/waitlist',
    CLAIM: (id: number) => `/waitlist/${id}/claim` as const,
    CANCEL: (id: number) => `/waitlist/${id}/cancel` as const,
  },
  NOTIFICATIONS: {
    LIST: '/notifications',
    MARK_READ: (id: number) => `/notifications/${id}/read` as const,
  },
  ADDRESSES: {
    LIST: '/addresses',
    ADD: '/addresses',
    // @demo-start
    DELETE: (id: number) => `/addresses/${id}` as const,
    // @demo-end
  },
  SERVICES: {
    LIST: '/services',
  },
  DEFERRED: {
    BY_VEHICLE: (vehicleId: number) => `/deferred/vehicles/${vehicleId}` as const,
    ALL: '/deferred',
    BOOK: (itemId: number) => `/deferred/${itemId}/book` as const,
    DECLINE: (itemId: number) => `/deferred/${itemId}/decline` as const,
  },
  BOOKINGS: {
    CREATE: '/bookings',
    SUGGEST: '/bookings/suggest',
    CONFIRM: (id: number) => `/bookings/${id}/confirm` as const,
    ETA: (id: number) => `/bookings/${id}/eta` as const,
    TRACK: (id: number) => `/bookings/${id}/track` as const,
    NLP_START: '/bookings/nlp/start',
    NLP_MESSAGE: (sessionId: string) => `/bookings/nlp/${sessionId}/message` as const,
    NLP_SELECT: (sessionId: string) => `/bookings/nlp/${sessionId}/select` as const,
    NLP_SESSION: (sessionId: string) => `/bookings/nlp/${sessionId}` as const,
    NLP_CANCEL: (sessionId: string) => `/bookings/nlp/${sessionId}` as const,
  },
  BOOKING_CHAT: {
    START: '/bookings/nlp/start',
    MESSAGE: (sessionId: string) => `/bookings/nlp/${sessionId}/message` as const,
    SELECT: (sessionId: string) => `/bookings/nlp/${sessionId}/select` as const,
    LOAD: (sessionId: string) => `/bookings/nlp/${sessionId}` as const,
    DELETE: (sessionId: string) => `/bookings/nlp/${sessionId}` as const,
  },
  PREFERENCES: {
    GET: '/preferences',
    UPDATE: '/preferences',
    VEHICLE_GET: (vehicleId: number) => `/preferences/vehicles/${vehicleId}` as const,
    VEHICLE_UPDATE: (vehicleId: number) => `/preferences/vehicles/${vehicleId}` as const,
    PROFILE_DETAILS_GET: '/preferences/profile-details',
    PROFILE_DETAILS_UPDATE: '/preferences/profile-details',
  },
  RATINGS: {
    SUBMIT: '/ratings',
  },
  NOTIFICATION_PREFERENCES: {
    GET: '/notification-preferences',
    UPDATE: '/notification-preferences',
  },
  PAYMENTS: {
    SETUP_INTENT: '/payments/setup-intent',
    METHODS: '/payments/methods',
    DELETE_METHOD: (id: string) => `/payments/methods/${id}` as const,
  },
  FLEET: {
    COMPLIANCE: '/fleet/compliance',
    DASHBOARD: '/fleet/dashboard',
    VEHICLES: '/fleet/vehicles',
    VEHICLE_DETAIL: (id: number) => `/fleet/vehicles/${id}` as const,
    DRIVERS: '/fleet/drivers',
    DRIVER_DETAIL: (id: number) => `/fleet/drivers/${id}` as const,
    INVITE_DRIVER: '/fleet/drivers/invite',
    REASSIGN_DRIVER: (vehicleId: number) => `/fleet/vehicles/${vehicleId}/assign-driver` as const,
    BOOKINGS: '/fleet/bookings',
    BOOKINGS_BATCH: '/fleet/bookings/batch',
    APPROVALS: '/fleet/approvals',
    REVIEW_APPROVAL: (id: number) => `/fleet/approvals/${id}` as const,
    SPEND: '/fleet/spend',
    INVOICES: '/fleet/invoices',
    BUDGET: '/fleet/budget',
    SETTINGS: '/fleet/settings',
    INSPECTIONS: '/fleet/inspections',
    INSPECTION_DETAIL: (id: number) => `/fleet/inspections/${id}` as const,
    INSPECTION_TEMPLATE: '/fleet/inspections/template',
    INSPECTION_REMIND: (vehicleId: number) => `/fleet/inspections/remind/${vehicleId}` as const,
    SHUTTLE: (id: number) => `/fleet/shuttle/${id}` as const,
    DRIVER_VEHICLE: '/fleet/driver/vehicle',
  },
  REFERRALS: {
    LIST: '/referrals',
    DETAIL: (id: number) => `/referrals/${id}` as const,
    ACCEPT_QUOTE: (id: number) => `/referrals/${id}/accept-quote` as const,
  },
  MESSAGES: {
    LIST: '/messages/conversations',
    START: '/messages/conversations',
    CONVERSATION: (conversationId: number) =>
      `/messages/conversations/${conversationId}` as const,
    SEND: (conversationId: number) =>
      `/messages/conversations/${conversationId}/send` as const,
  },
} as const;
