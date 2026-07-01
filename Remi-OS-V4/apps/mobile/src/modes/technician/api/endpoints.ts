export const Endpoints = {
  auth: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    capabilities: "/auth/me/capabilities",
  },
  profile: "/profile",
  profileAvatar: "/profile/avatar",
  profileDeviceToken: "/profile/device-token",
  jobs: {
    list: "/jobs",
    detail: (id: number) => `/jobs/${id}`,
    updateStatus: (id: number) => `/jobs/${id}/status`,
    decodeVehicle: "/jobs/decode-vehicle",
    scanVehicle: "/jobs/scan-vehicle",
    walkIn: "/jobs/walk-in",
    addService: (id: number) => `/jobs/${id}/services`,
    checklist: (id: number) => `/jobs/${id}/checklist`,
    startService: (id: number, serviceId: number) =>
      `/jobs/${id}/services/${serviceId}/start`,
    completeService: (id: number, serviceId: number) =>
      `/jobs/${id}/services/${serviceId}/complete`,
    invoice: (id: number) => `/jobs/${id}/invoice`,
    substituteLineItem: (id: number, lineItemId: number) =>
      `/jobs/${id}/line-items/${lineItemId}/substitute`,
    collectPayment: (id: number) => `/jobs/${id}/collect-payment`,
    confirmPayment: (id: number) => `/jobs/${id}/payment-confirmation`,
    recordNonCardPayment: (id: number) =>
      `/jobs/${id}/record-non-card-payment`,
    sendReceipt: (id: number) => `/jobs/${id}/send-receipt`,
    reportCarfax: (id: number) => `/jobs/${id}/report-carfax`,
  },
  orders: {
    search: "/orders/search",
    exportCsv: "/orders/export-csv",
    exportPdf: "/orders/export-pdf",
    // Phase 4 Chunk 4.5 — combined multi-receipt PDF export (Chunk 4.4
    // BE endpoint). Distinct from `exportPdf` (legacy tabular summary
    // via `pdfkit`). No franchise mirror — Chunk 4.4 deliberately
    // didn't register the franchise route; FE button is gated to
    // `UserRole.TECHNICIAN` only.
    exportReceipts: "/orders/export-receipts",
    bulkMarkPaid: "/orders/bulk-mark-paid",
    addNote: (jobId: number) => `/jobs/${jobId}/notes`,
    tagForReview: "/orders/tag-for-review",
  },
  services: {
    catalog: "/services",
  },
  vehicles: {
    findOrCreate: "/vehicles",
    search: "/vehicles/search",
    fluids: (vehicleId: number) => `/vehicles/${vehicleId}/fluids`,
    parts: (vehicleId: number) => `/vehicles/${vehicleId}/parts`,
  },
  customers: {
    list: "/customers/list",
    search: "/customers/search",
    quickAdd: "/customers",
    detail: (id: number) => `/customers/${id}`,
  },
  motor: {
    fluids: (baseVehicleId: number) => `/motor/fluids/${baseVehicleId}`,
  },
  schedule: {
    range: "/schedule",
    today: "/schedule/today",
    availability: "/schedule/availability",
  },
  inventory: {
    stock: "/inventory/stock",
    parAlerts: "/inventory/par-alerts",
    reserve: "/inventory/reserve",
    consume: "/inventory/consume",
    waste: "/inventory/waste",
    wasteStatus: "/inventory/waste-status",
    adjust: "/inventory/adjust",
    stockCheck: (appointmentId: number) =>
      `/inventory/stock-check/${appointmentId}`,
    substitutes: (itemId: number) => `/inventory/items/${itemId}/substitutes`,
    requestTransfer: "/inventory/transfer-request",
  },
  ratings: {
    submitTechRating: (appointmentId: number) =>
      `/jobs/${appointmentId}/rate-customer`,
    myPerformance: "/ratings/my-performance",
  },
  messages: {
    conversations: "/messages/conversations",
    conversationDetail: (id: number) => `/messages/conversations/${id}`,
    templates: "/messages/templates",
    send: (conversationId: number) =>
      `/messages/conversations/${conversationId}/send`,
    // MSG-BE-2 — tech-initiated start. POST { customer_id } returns the
    // existing conversation if one exists, otherwise creates a new one.
    startConversation: "/messages/conversations",
    // AI message draft lifecycle — see
    // `docs/implementation-plans/ai-message-draft-contract.md`. CG-6 made
    // `send` accept an optional `{ edited_text }` body so the client can
    // edit + send in a single round-trip without an explicit `/edit` call.
    draft: {
      create: "/messages/draft",
      pending: "/messages/drafts/pending",
      list: "/messages/drafts",
      detail: (id: number) => `/messages/drafts/${id}`,
      edit: (id: number) => `/messages/drafts/${id}/edit`,
      approve: (id: number) => `/messages/drafts/${id}/approve`,
      send: (id: number) => `/messages/drafts/${id}/send`,
      reject: (id: number) => `/messages/drafts/${id}/reject`,
      editPatterns: "/messages/edit-patterns",
    },
  },
  routes: {
    today: "/routes/today",
    byDate: "/routes",
    optimize: "/routes/optimize",
    arriveAtStop: (stopId: number) => `/routes/stops/${stopId}/arrive`,
    departStop: (stopId: number) => `/routes/stops/${stopId}/depart`,
  },
  location: {
    update: "/location",
  },
  dispatch: {
    suggest: "/dispatch/suggest",
    accept: (appointmentId: number) =>
      `/appointments/${appointmentId}/accept`,
    reject: (appointmentId: number) =>
      `/appointments/${appointmentId}/reject`,
  },
  // GET /technician/appointments?vehicle_id=&customer_id=&status=active|...
  // Powers the walk-in branch: "is there an active appointment for this vehicle?"
  // Backed by `wellness-ai-and-walk-in-contract.md` § 2.
  appointments: {
    list: "/appointments",
    detail: (id: number) => `/appointments/${id}`,
  },
  carfax: {
    retry: (appointmentId: number) => `/carfax/retry/${appointmentId}`,
    quickVin: "/carfax/quickvin",
    serviceHistory: "/carfax/service-history",
  },
  referrals: {
    create: "/referrals",
    myReferrals: "/referrals/my-referrals",
    detail: (id: number) => `/referrals/${id}`,
  },
  training: {
    myCertifications: "/training/my-certifications",
    myModules: "/training/my-modules",
    completeModule: (id: number) => `/training/modules/${id}/complete`,
    myOnboarding: "/training/my-onboarding",
    markOnboardingStep: (stepName: string) =>
      `/training/onboarding/${stepName}`,
  },
  briefing: {
    byDate: (date: string) => `/briefing/${date}`,
  },
  timer: {
    start: (jobId: number) => `/jobs/${jobId}/timer/start`,
    status: (jobId: number) => `/jobs/${jobId}/timer/status`,
    notify: (jobId: number) => `/jobs/${jobId}/timer/notify`,
    logEvent: (jobId: number) => `/jobs/${jobId}/timer/event`,
    leaveBy: (jobId: number) => `/jobs/${jobId}/timer/leave-by`,
  },
  preferences: {
    byCustomer: (customerId: number) => `/customers/${customerId}/preferences`,
  },
  fluids: {
    record: (jobId: number) => `/jobs/${jobId}/fluids`,
    history: (vehicleId: number) => `/vehicles/${vehicleId}/fluid-history`,
  },
  tread: {
    record: (jobId: number) => `/jobs/${jobId}/tread`,
    history: (vehicleId: number) => `/vehicles/${vehicleId}/tread-history`,
  },
  voiceDebrief: {
    submit: (jobId: number) => `/jobs/${jobId}/debrief`,
  },
  recommendations: {
    byVehicle: (vehicleId: number) => `/vehicles/${vehicleId}/recommendations`,
    logInspection: (jobId: number, recId: number) =>
      `/jobs/${jobId}/recommendations/${recId}`,
  },
  university: {
    schools: "/training/schools",
    courses: (schoolId: number) => `/training/schools/${schoolId}/courses`,
    modules: (courseId: number) => `/training/courses/${courseId}/modules`,
    lessons: (moduleId: number) => `/training/modules/${moduleId}/lessons`,
    quiz: (moduleId: number) => `/training/modules/${moduleId}/quiz`,
    submitQuiz: (quizId: number) => `/training/quizzes/${quizId}/attempt`,
    videoUpload: "/training/video-submissions",
    certificationLevel: "/training/my-certification-level",
    certificationRequirements: (level: number) =>
      `/training/certification-requirements/${level}`,
  },
  deferred: {
    create: "/deferred",
    byAppointment: (appointmentId: number) => `/deferred/${appointmentId}`,
    byVehicle: (vehicleId: number) => `/deferred/vehicle/${vehicleId}`,
    communicate: (appointmentId: number) =>
      `/deferred/${appointmentId}/communicate`,
    audit: (itemId: number) => `/deferred/${itemId}/audit`,
  },
  bugReports: {
    list: "/bug-reports",
    detail: (id: string) => `/bug-reports/${id}`,
    submit: "/bug-reports",
    frustration: "/bug-reports/frustration",
    knownIssues: "/bug-reports/known-issues",
    uploadUrl: "/bug-reports/upload-url",
  },
  // ── Reorganization sessions (calendar-reorganization master plan §6.1) ──
  // The Pending Reality surface (P3-FE-*) composes a draft session
  // server-side, then submits it for finalize (server linter gate)
  // and commit (atomic transaction). The route prefix is
  // `/api/v1/technician/reorganizations/...` — `Endpoints.*` already
  // sit under `/api/v1/technician/` per `src/constants/config.ts`.
  reorganizations: {
    create: "/reorganizations",
    detail: (id: number) => `/reorganizations/${id}`,
    update: (id: number) => `/reorganizations/${id}`,
    finalize: (id: number) => `/reorganizations/${id}/finalize`,
    commit: (id: number) => `/reorganizations/${id}/commit`,
    // FE-CR-1-2 — bulk per-intent commit. Surfaced by REMIBackend
    // `B-CR-1-2` (2026-05-10) so the FE can commit a subset of clean
    // intents while leaving dirty ones staged in the same session.
    // Idempotency-allowlisted on the BE; consumers MUST send a fresh
    // `Idempotency-Key` per `mutate()` call (the BE replays a
    // deduplicated response for the same key). Body shape:
    // `{ intent_ids: number[] }` (non-empty, positive ints).
    commitMany: (id: number) => `/reorganizations/${id}/intents/commit-many`,
    cancel: (id: number) => `/reorganizations/${id}/cancel`,
    // Cold-start rehydration GET (`P3-FE-REHYDRATE-DETAIL` ships this
    // endpoint constant; consumed by `useActiveReorganization` in
    // `P3-FE-REHYDRATE-MOUNT`). Backed by REMIBackend
    // `getActiveSessionForAuthor` (REMIBackend PR #59); returns
    // `serializeSession(session, intents)` or `null` for the caller's
    // newest non-terminal session. See
    // `docs/implementation-plans/pending-reality-rehydration-plan.md` §6.2.
    mineActive: "/reorganizations/mine/active",
  },
  calendar: {
    dayView: (date: string) => `/calendar/day/${date}`,
    weekView: (startDate: string) => `/calendar/week/${startDate}`,
    rescheduleAppointment: (id: number) =>
      `/calendar/appointments/${id}/reschedule`,
    createPersonalEvent: "/calendar/personal-events",
    updatePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
    deletePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
    quicktext: (appointmentId: number) =>
      `/calendar/appointments/${appointmentId}/quicktext`,
    // Customer-appointment creation surface (parity with franchise calendarV2,
    // but franchise-scoped server-side and forces technician_id = self).
    createAppointment: "/calendar/appointments",
    appointmentDetail: (id: number) => `/calendar/appointments/${id}`,
    customerSearch: "/calendar/customers/search",
    recentCustomers: "/calendar/customers/recent",
    quickCreateCustomer: "/calendar/customers",
    services: "/calendar/services",
  },
  settings: {
    get: "/settings",
    update: "/settings",
  },
  copilot: {
    briefing: (appointmentId: number) =>
      `/copilot/briefing/${appointmentId}`,
    suggestions: (appointmentId: number) =>
      `/copilot/suggestions/${appointmentId}`,
    // The Copilot chat is sessionful: callers must POST /chat/start once
    // to obtain a sessionId, then POST /chat/:sessionId for every message
    // in that conversation. The legacy `chat: "/copilot/chat"` constant
    // pointed at a route that has never existed on the BE — every send
    // 404'd into the FE error toast. See docs/PLAN-DEVIATIONS.md#
    // 2026-04-26-ask-remi-session-wire.
    chatStart: "/copilot/chat/start",
    chatMessage: (sessionId: string) => `/copilot/chat/${sessionId}`,
    chatEnd: (sessionId: string) => `/copilot/chat/${sessionId}`,
    timeOverflow: (appointmentId: number) =>
      `/copilot/time-overflow/${appointmentId}`,
    voiceSession: "/copilot/voice/session",
    voiceToolCall: "/copilot/voice/tool-call",
  },
  signal: {
    feed: "/signal/feed",
    post: (id: number) => `/signal/posts/${id}`,
    create: "/signal/posts",
    // PLAN-DEVIATION: 2026-04-25-signal-be-shape-bridge — the per-post
    // /like and /unlike endpoints don't exist on the BE; they were authored
    // FE-side from a stale spec. The real endpoint is `POST /signal/reactions`
    // with body `{ post_id, reaction_type }` (single toggle, not separate
    // verbs). Keeping the legacy constants here purely so old call sites that
    // haven't been migrated still type-check; remove them once nothing
    // references them. See docs/PLAN-DEVIATIONS.md#2026-04-25-signal-be-shape-bridge.
    like: (id: number) => `/signal/posts/${id}/like`,
    unlike: (id: number) => `/signal/posts/${id}/unlike`,
    reactions: "/signal/reactions",
    comments: (id: number) => `/signal/posts/${id}/comments`,
    addComment: (id: number) => `/signal/posts/${id}/comments`,
    uploadMedia: "/signal/upload",
  },
  wellness: {
    checkin: "/wellness/check-in",
    history: "/wellness/history",
    streak: "/wellness/streak",
    teamAggregate: "/wellness/team",
    coachResponse: (checkInId: number) =>
      `/wellness/coach-response/${checkInId}`,
    generateCoachResponse: "/wellness/coach-response",
    nudges: "/wellness/nudges",
    acknowledgeNudge: (nudgeId: number) =>
      `/wellness/nudges/${nudgeId}/acknowledge`,
  },
  xp: {
    summary: "/training/xp/summary",
  },
  trainingModules: {
    detail: (moduleId: number) => `/training/modules/${moduleId}`,
    completeLesson: (lessonId: number) =>
      `/training/lessons/${lessonId}/complete`,
    submitAssessment: (assessmentId: number) =>
      `/training/assessments/${assessmentId}/submit`,
    assigned: "/training/assigned",
  },
  scenarios: {
    detail: (moduleId: number) => `/training/scenarios/${moduleId}`,
    decide: (moduleId: number) => `/training/scenarios/${moduleId}/decide`,
  },
  certification: {
    progress: "/certification/progress",
    standing: "/certification/standing",
  },
  theme: {
    byFranchise: (franchiseId: number) => `/franchise/${franchiseId}/theme`,
  },
  soundPreferences: {
    get: "/settings/sounds",
    update: "/settings/sounds",
  },
  // @demo-start
  demo: {
    reset: "/demo/reset",
    // D2P-FE-14 — sibling reset that seeds intentional drag/drop
    // conflicts so the Pending Reality intercept actually fires
    // during a demo. See `docs/implementation-plans/pending-reality-
    // demo-bundle.md` §6.1.1.
    resetWithConflicts: "/demo/reset-with-conflicts",
    // D2P-FE-14 — manual AI scan trigger so an FO can show the
    // suggestion-review surface on demand without waiting for the
    // ambient AI cron. PRD §6.1.2.
    runAiScan: "/demo/run-ai-scan",
  },
  // @demo-end
  // 2026-05-25 — Field-test calendar seeder (gated on BE by
  // `@maxi-mobile.com` email domain). The settings screen shows the
  // entry to these endpoints behind the same gate so non-field-test
  // accounts never see them.
  fieldTestSeed: {
    reseed: "/dev/field-test-seed/reseed",
    clear: "/dev/field-test-seed/clear",
  },
} as const;

// LDM-WAVE-1 CHUNK-4 — `/api/v1/admin/permissions/...` — franchisor-only
// cross-franchise capability override admin. Mounted via `adminApi()` in
// `src/api/client.ts`. All endpoints below are gated by
// `requireCapability("perms.admin.global")` on the BE.
export const AdminEndpoints = {
  permissions: {
    franchises: "/permissions/franchises",
    users: "/permissions/users",
    userCapability: (userId: number, capability: string) =>
      `/permissions/users/${userId}/capabilities/${capability}`,
    userAudit: (userId: number) => `/permissions/users/${userId}/audit`,
  },
} as const;

// `/api/v1/tools/...` — public-facing standalone tools (mixed anonymous +
// authenticated). Mounted via `toolsApi()` in `src/api/client.ts`.
export const ToolsEndpoints = {
  profitModel: {
    sessions: "/profit-model/sessions",
    sessionsAuth: "/profit-model/sessions/auth",
    session: (shareToken: string) => `/profit-model/sessions/${shareToken}`,
  },
} as const;

export const FranchiseEndpoints = {
  auth: {
    capabilities: "/auth/me/capabilities",
  },
  // LDM-WAVE-1 CHUNK-3 — per-user capability override admin (franchise-scoped).
  // All gated by perms.admin.franchise. Cross-franchise admin (perms.admin.global)
  // is parked for CHUNK-4.
  admin: {
    users: "/admin/users",
    userCapability: (userId: number, capability: string) =>
      `/admin/users/${userId}/capabilities/${capability}`,
    userAudit: (userId: number) => `/admin/users/${userId}/audit`,
  },
  briefing: {
    byDate: (date: string) => `/briefing/${date}`,
  },
  orders: "/orders",
  orderSearch: "/orders/search",
  exportCsv: "/orders/export-csv",
  exportPdf: "/orders/export-pdf",
  bulkMarkPaid: "/orders/bulk-mark-paid",
  tagForReview: "/orders/tag-for-review",
  calendar: "/calendar",
  reassign: "/calendar/reassign",
  dispatchOverview: "/dispatch/overview",
  dispatchMap: "/dispatch/map",
  dispatchAlerts: "/dispatch/alerts",
  techMetrics: "/dispatch/tech-metrics",
  inventory: {
    parLevels: "/inventory/par-levels",
    parLevelsBulk: "/inventory/par-levels/bulk",
    suppliers: "/inventory/suppliers",
    supplierDetail: (id: number) => `/inventory/suppliers/${id}`,
    purchaseOrders: "/inventory/purchase-orders",
    purchaseOrderDetail: (id: number) => `/inventory/purchase-orders/${id}`,
    purchaseOrderSubmit: (id: number) =>
      `/inventory/purchase-orders/${id}/submit`,
    purchaseOrderReceive: (id: number) =>
      `/inventory/purchase-orders/${id}/receive`,
    transfers: "/inventory/transfers",
    adjust: "/inventory/adjust",
    history: "/inventory/history",
    wasteDashboard: "/inventory/waste-dashboard",
    reorderSuggestions: "/inventory/reorder-suggestions",
  },
  fleet: {
    companies: "/fleet/companies",
    // 2026-05-25 — batched rollup for the FleetAnalyticsScreen.
    // Replaces 3×N per-company calls (dashboard + health + deferred).
    companiesAnalyticsRollup: "/fleet/companies/analytics-rollup",
    companyDetail: (id: number) => `/fleet/companies/${id}`,
    companyVehicles: (id: number) => `/fleet/companies/${id}/vehicles`,
    companyOrders: (id: number) => `/fleet/companies/${id}/orders`,
    companyDashboard: (id: number) => `/fleet/companies/${id}/dashboard`,
    companyDueSoon: (id: number) => `/fleet/companies/${id}/due-soon`,
    companyBilling: (id: number) => `/fleet/companies/${id}/billing`,
    assignVehicle: (companyId: number) =>
      `/fleet/companies/${companyId}/vehicles`,
    vehicleDriver: (companyId: number, vehicleId: number) =>
      `/fleet/companies/${companyId}/vehicles/${vehicleId}/driver`,
    companyHealth: (id: number) => `/fleet/companies/${id}/health`,
    companyDeferredSummary: (id: number) =>
      `/fleet/companies/${id}/deferred-summary`,
    companyOutreachTargets: (id: number) =>
      `/fleet/companies/${id}/outreach-targets`,
    createBooking: (companyId: number) =>
      `/fleet/companies/${companyId}/bookings`,
    batchBooking: (companyId: number) =>
      `/fleet/companies/${companyId}/bookings/batch`,
    nudge: (companyId: number) =>
      `/fleet/companies/${companyId}/nudge`,
    dueSoonAll: "/fleet/due-soon",
    nudgeBulk: "/fleet/nudge",
  },
  bugReports: {
    list: "/bug-reports",
    detail: (id: string) => `/bug-reports/${id}`,
    status: (id: string) => `/bug-reports/${id}/status`,
    notes: (id: string) => `/bug-reports/${id}/notes`,
    escalate: (id: string) => `/bug-reports/${id}/escalate`,
    metrics: "/bug-reports/metrics",
    knownIssues: "/bug-reports/known-issues",
    uploadUrl: "/bug-reports/upload-url",
  },
  // ── Franchise-scoped reorganization sessions (master plan §6.2) ──
  // The franchise dashboard composes / reviews sessions with FO authority.
  // The technician app ships P7-FE-1 to surface AI-suggestion sessions in
  // the existing Pending Reality review screen with FO-only actions
  // (authorize / deny / counter-propose) — see §5.2.5. The technician-side
  // `Endpoints.reorganizations` family is for *tech-authored* drafts only;
  // these franchise endpoints are reachable to FO/franchisor users via the
  // franchise client and require an FO-role JWT to authorize.
  reorganizations: {
    list: "/reorganizations",
    detail: (id: number) => `/reorganizations/${id}`,
    authorize: (id: number) => `/reorganizations/${id}/authorize`,
    deny: (id: number) => `/reorganizations/${id}/deny`,
    counterPropose: (id: number) => `/reorganizations/${id}/counter-propose`,
  },
  // ── Messaging oversight (MSG-BE-2) ──
  // FO inbox + thread + send. Server returns the conversation header
  // alongside its messages on `conversationDetail` so the FO UI can
  // render customer/tech names without a follow-up GET.
  messages: {
    conversations: "/messages/conversations",
    conversationDetail: (id: number) => `/messages/conversations/${id}`,
    send: (id: number) => `/messages/conversations/${id}/send`,
  },
  // ── Per-franchise settings (master plan §3.6 + §2.5) ──
  // The reorganization-policy editor (P7-FE-1 trust-gradient panel) reads
  // and writes the JSONB column on `franchises.reorganization_policy`. The
  // sibling endpoint pair ships in REMIBackend with this PR per the chunk
  // prompt ("small enough to not warrant its own chunk").
  settings: {
    reorganizationPolicy: "/settings/reorganization-policy",
    // Phase 2 Chunk 2.3 — per-franchise CARFAX submission cadence.
    // Backs the FO-only Settings → CARFAX toggle (every_job vs. nightly_batch).
    // BE shipped 2026-05-23 (Chunk 2.3 BE half, squash `def18ca`).
    carfax: "/settings/carfax",
  },
  shuttle: {
    createOrder: "/shuttle/orders",
    listOrders: "/shuttle/orders",
    orderDetail: (id: number) => `/shuttle/orders/${id}`,
    assignDriver: (id: number) => `/shuttle/orders/${id}/assign`,
    pickup: (id: number) => `/shuttle/orders/${id}/pickup`,
    deliver: (id: number) => `/shuttle/orders/${id}/deliver`,
    shopStatus: (id: number) => `/shuttle/orders/${id}/shop-status`,
    shopComplete: (id: number) => `/shuttle/orders/${id}/shop-complete`,
    returnPickup: (id: number) => `/shuttle/orders/${id}/return-pickup`,
    complete: (id: number) => `/shuttle/orders/${id}/complete`,
    cancel: (id: number) => `/shuttle/orders/${id}/cancel`,
    statusLog: (id: number) => `/shuttle/orders/${id}/status-log`,
    dashboard: "/shuttle/dashboard",
    companyOrders: (companyId: number) =>
      `/shuttle/companies/${companyId}/orders`,
  },
  shield: {
    schedule: "/shield/schedule",
    inspections: "/shield/inspections",
    inspectionDetail: (id: number) => `/shield/inspections/${id}`,
    history: "/shield/history",
  },
  training: {
    certifications: "/training/certifications",
    certificationDetail: (id: number) => `/training/certifications/${id}`,
    modules: "/training/modules",
    compliance: "/training/compliance",
    onboarding: (userId: number) => `/training/onboarding/${userId}`,
  },
  referrals: {
    list: "/referrals",
    detail: (id: number) => `/referrals/${id}`,
    transition: (id: number) => `/referrals/${id}/transition`,
    events: (id: number) => `/referrals/${id}/events`,
    attribution: "/referrals/attribution",
  },
  partners: {
    list: "/partners",
    detail: (id: number) => `/partners/${id}`,
  },
  calendarV2: {
    dayView: (date: string) => `/calendar/day/${date}`,
    weekView: (startDate: string) => `/calendar/week/${startDate}`,
    monthView: (year: number, month: number) =>
      `/calendar/month/${year}/${month}`,
    createAppointment: "/calendar/appointments",
    updateAppointment: (id: number) => `/calendar/appointments/${id}`,
    appointmentDetail: (id: number) => `/calendar/appointments/${id}`,
    cancelAppointment: (id: number) => `/calendar/appointments/${id}/cancel`,
    // 2026-05-25 — Hard delete for unpaid appointments. Use this
    // instead of `cancelAppointment` when the operator wants the
    // row GONE (e.g. mistakenly created appointment) rather than
    // marked cancelled. BE refuses if payment has succeeded.
    deleteAppointment: (id: number) => `/calendar/appointments/${id}`,
    noShowAppointment: (id: number) => `/calendar/appointments/${id}/no-show`,
    rescheduleAppointment: (id: number) =>
      `/calendar/appointments/${id}/reschedule`,
    quicktext: (id: number) => `/calendar/appointments/${id}/quicktext`,
    generateAppointment: "/calendar/appointments/generate",
    customerSearch: "/calendar/customers/search",
    recentCustomers: "/calendar/customers/recent",
    quickCreateCustomer: "/calendar/customers",
    services: "/calendar/services",
    createPersonalEvent: "/calendar/personal-events",
    updatePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
    deletePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
    personalEventDetail: (id: string) => `/calendar/personal-events/${id}`,
    flexList: "/calendar/flex-list",
    flexListOffer: (id: string) => `/calendar/flex-list/${id}/offer`,
    taxRates: "/calendar/tax-rates",
    briefing: (date: string) => `/calendar/briefing/${date}`,
    routeVisualization: (date: string) => `/calendar/routes/${date}`,
  },
} as const;
