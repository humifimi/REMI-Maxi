# REMI Technician

Mobile app for REMI technicians and franchise owners. Built with Expo 54, React Native, and TypeScript.

## Tech Stack

- **Framework:** Expo 54, React Native 0.81, TypeScript
- **Navigation:** Expo Router 6 (file-based routing)
- **Server State:** TanStack Query (data fetching, caching, mutations)
- **Client State:** Zustand (auth tokens, job flow wizard, calendar view state)
- **Forms:** React Hook Form + Zod validation
- **API:** Axios with JWT interceptors and token refresh
- **Calendar:** react-native-resource-calendar (all calendar views — franchise-owner multi-tech dispatch + technician single-column day/workweek, drag-to-move, pinch-to-resize, viewfinder zoom, 5 AM–6 PM display range, small-event UX)
- **Sheets:** @gorhom/bottom-sheet (modal sheets for forms, details, actions)
- **Dates:** dayjs (date manipulation, formatting)
- **Maps:** react-native-maps (route visualization, stop markers)
- **Location:** expo-location + expo-task-manager (background GPS tracking)
- **Notifications:** expo-notifications (push notifications, stock alerts)
- **Storage:** expo-secure-store (tokens), AsyncStorage (preferences)

## Project Structure

```
app/
  _layout.tsx           Root layout with providers and auth gate
  (auth)/               Login and unauthenticated screens
  (public)/             Pre-auth route group (visible without sign-in)
    profit-calculator.tsx  Profit Calculator — territory economics modeller (KPIs + accordion inputs + detailed P&L modal + save/load to backend for authenticated users + anonymous "Save to permanent link" share for everyone else)
    profit-model/share/[token].tsx  Deep-link landing for `remi://profit-model/share/:token` — fetches the shared session and replaces nav onto the calculator
  (tabs)/               Bottom tab navigator (6 tabs)
    index.tsx           Calendar — route/day/week views + franchise dispatch
    start-job.tsx       Start Job tab — redirects to /job/new/confirm-vehicle
    orders.tsx          Orders — searchable order ledger with filters, swipe actions, bulk export + fleet manager
    customers.tsx       Customers — browsable list with filters + search + quick-add
    signal.tsx          Signal — team feed with text/photo/video/help-request posts, like/comment, search + filter
    more.tsx            More — profile, inventory, shield, training, referrals, settings, FO-only Demo Mode panel (D2P-FE-14), reset demo data, logout
  job/[id]/             11-step job execution flow
    briefing.tsx        Pre-job AI briefing — customer summary, vehicle history, talking points, upsells
    confirm-vehicle.tsx Vehicle picker + confirmation (scanner, VIN decode, manual entry, scheduled-job pre-population)
    customer.tsx        Customer selection + dispatch suggestions
    services.tsx        Service selection — sectioned (Scheduled / AI Recommended / All), fuzzy upsell matching
    checklist.tsx       Pre-service inspection + tire tread depth
    timer.tsx           Service timer — countdown from scheduled duration, customer context card, compact leave-by, home button
    invoice.tsx         Invoice review (per-row substitute affordance for part/fluid lines)
    payment.tsx         Payment collection
    fluids.tsx          Fluid level documentation (6 fluid types)
    debrief.tsx         Voice/text debrief with AI categorization
    complete.tsx        Job completion summary
  order/[id].tsx        Order detail (status, customer, vehicle, location, services)
  customer/[id].tsx     Customer detail (profile, stats, vehicles, addresses, service history)
  message/
    index.tsx           Conversation list
    [id].tsx            Conversation detail + QuickText template picker
  franchise/
    messages/           Franchise Owner messaging-oversight stack (role-gated, MSG-FE-FO-1)
      index.tsx         FO inbox: search, sort, tech filter chips, FO-private unread dots
      [id].tsx          FO thread + dual-attribution composer (Send-as-Me / Send-as-{Tech} silent takeover)
  inventory/            Stock management (6 screens)
  fleet/                Fleet management (8 screens: list, detail, check, book, analytics, shuttle list, shuttle order detail, due-soon)
  shield/               Shield QA inspections (3 screens)
  training/             MAXI University (school browser, courses, modules, lessons, quizzes, certification, video upload, onboarding, module consumption [moduleId], assigned training hub, scenario training)
  referral/             Referral creation + history (2 screens)
  performance.tsx       My Performance — reputation dashboard with ratings, category breakdown, badges, trends
  team-wellness.tsx     Team Wellness — franchise owner aggregate mood trends, check-in rates, flags (role-gated)
  wellness.tsx          Wellness Nudge — deep link target for smart nudge push notifications with resource links and dismiss
  briefing.tsx          Daily briefing — pre-shift summary with materials, route, alerts
  copilot/
    _layout.tsx         Copilot stack layout
    chat.tsx            Ask REMI — AI chat interface with source citations
    voice.tsx           Voice Copilot — hands-free voice-to-voice via OpenAI Realtime API (WebRTC)
  signal/
    _layout.tsx         Signal stack layout
    create-post.tsx     New post creation (text/photo/video + tags)
    help-request.tsx    4-step help request flow (photo → describe → category → review/submit)
    post.tsx            Post detail with comment thread
  help/                 Help & Support (bug reporting, report history, reporter settings)
  settings/             Reorganization Policy editor (P7-FE-1 — FO-only trust-gradient settings via `/api/v1/franchise/settings/reorganization-policy`)

src/
  api/                  Axios client + endpoint constants (technician + franchise + tools — `toolsClient` for `/api/v1/tools/...` mixed-auth endpoints; `profit-model.ts` for PM-6 session save/load methods)
  stores/               Zustand stores (auth, job flow wizard, calendar, dispatch offer, active timer, theme, sound, draft-trigger, profit-model-draft-store — one-shot handoff for share-link deep links, pending-reality — active reorganization session + staged intents + local linter output, sheet-draft — session-scoped RHF cache for the five calendar form sheets so typed contents survive implicit close, P3-FE-6, demo-settings — FO-only Demo Mode panel state — devShortcutVisible / linterStrictness / dualDeviceMode, AsyncStorage-persisted, D2P-FE-14)
  hooks/                TanStack Query hooks organized by domain
    auth/               Authentication, biometric, profile, avatar, settings, performance, theme (7)
    jobs/               Job execution flow, timers, checklists, tracking, debrief, time-overflow notify (12)
    schedule/           Calendar views, appointments, personal events, flex list, walk-in booking (8)
    customers/          CRM, vehicles, referrals, preferences, unified search (5)
    orders/             Payment, invoice, tax, export, ratings (5)
    communication/      Messages, quicktext (2)
    inventory/          Stock management, fleet, substitution & stock check (3)
    (root)              Fleet due-soon cross-company hook (use-fleet-due-soon)
    ai/                 Copilot (briefing, suggestions, chat, voice-copilot, voice-transcript), signal, frustration detection, message draft (full lifecycle: create, edit, approve, send, sendEdited, reject; CG-6 combined send-with-edit) (6)
    operations/         Dispatch, routes, shuttle, realtime, franchise calendar, shield (7)
    franchise/          Franchise-scoped reorganization session hooks (P7-FE-1) — `useReorganizationPolicy` + `useUpdateReorganizationPolicy` for the trust-gradient settings panel; `useFranchiseReorganizationSessions` (raw list with optional status filter) + `useAiSuggestionSessions` (client-side `source === "ai_suggestion"` filter for the AI tab) + `useFranchiseReorganizationSession` (per-session detail) for read paths; `useAuthorizeReorganizationSession` / `useDenyReorganizationSession` (with structured `decline_reason_kind`) / `useCounterProposeReorganizationSession` for FO actions — all mutation hooks plumb `Idempotency-Key` per §6.3
    realtime/           WebSocket subscriptions — `useRealtimeChannel` (generic primitive: WS auth handshake, channel subscribe, ping keepalive, server-ping pong, auto-reconnect) + `useRealtimeReorganization` (P6-FE-1, FE-G14 — subscribes to `franchise:{id}:reorganization`, dispatches §6.6.3 envelope events to TanStack Query invalidations only; local-store reconciliation flows through `reconcileActiveSession` running inside `useActiveReorganization` / `useReorganizationSession` queryFns after the refetch — see PLAN-DEVIATIONS `2026-05-08-realtime-no-store-mutation`)
    profit-calculator/  Persisted scenario hook (use-persisted-scenario — debounced expo-secure-store sync of last-used inputs); session save/load TanStack Query hooks (use-profit-sessions — list / detail / create-anon / create-auth / update / delete)
    training/           Training, university, training XP, training modules (assigned/detail/complete/assess), certification progress/standing, scenario module/decision (6)
    utility/            Haptics, location, bug report, voice recorder, wellness, team wellness, notifications, stock alerts, sound system (14)
  utils/                Shared utilities (navigation — open maps, format travel time; color-for-tech — deterministic per-tech palette hash for calendar overlay mode; orientation — `lockToPortrait()` + `allowAllOrientations()` defensive wrappers around `expo-screen-orientation`; logistics-linter — pure-function five-rule scheduling linter mirrored verbatim from REMIBackend `src/services/scheduling/logistics-linter.ts`, fixtures shared via `__fixtures__/linter-cases` symlink, P1-BE-4. See `.cursor/rules/logistics-linter.mdc`)
  schemas/              Zod schemas backing every RHF-driven form (P2-FE-1) — `appointmentForm.ts` (factory schema for create vs. edit + `quickCreateCustomerSchema` for the inline new-customer sub-form, used by `src/components/calendar/appointment-form-sheet.tsx`); `reschedule.ts` (Dayjs-backed schema used by `src/components/calendar/reschedule-sheet.tsx`). Pure schemas — no React Native deps — and exhaustively covered by spec tests under `src/schemas/__tests__/`.
  services/             Service abstractions (bug report local service, frustration tracker)
  notifications/        Push notification routing — handlers.ts maps push payloads (stock alerts, dispatch, wellness_nudge with ai_response_id deep-link, message_draft_ready with draft_id → opens AI draft sheet via `triggerDraft`) to deep-link routes and sound keys
  types/                TypeScript interfaces and enums (including calendar models, fleet due-soon types, scenario training types, booking types, wellness AI types, messaging types — `MessageDraft`, `DraftIntent`, `DraftStatus`, `DraftRecipient`, `INTENT_DISPLAY`)
  constants/            Colors, config, status mappings, brand config, checklist mappings, calendar config, runtime flags, sounds
  components/           Reusable UI organized by domain
    bug-report/         6 components (bubble, composer, attachments, annotation, voice, toast)
    calendar/           24 portrait calendar components (event blocks, sheets, header, month view, day/week wrappers, chrome modules: DailyBriefingBanner, CalendarDateNavRow, CalendarModeRow, WorkweekAvatarStrip, WorkweekBackBar, WorkweekDateNav)
    customer/           2 components (customer-card, customer-filter-sheet)
    fleet/              4 components (fleet-company-card, nudge-action-sheet, due-soon-vehicle-row, nudge-template-picker)
    job/                3 components (job-card, vehicle-scanner, post-job-rating-prompt)
    walk-in/            2 components (walk-in-card — Quick Book card shown when plate scan finds no active appointment, new-customer-form — inline name + phone form sent as `new_customer` on the walk-in POST)
    order/              3 components (order-card, order-filter-sheet, order-note-sheet)
    route/              6 components (route-timeline, route-map-view, franchise-route-map, franchise-tech-column, dispatch-suggestion-card, route-stop-card)
    service/            5 components (deferred-item-capture, deferred-services-card, recommendation-badge, service-card, tire-tread-input)
    inventory/          2 components (stock-warning-banner — pre-job stock alert, substitution-sheet — substitute parts modal with Pull from HQ + View in Inventory fallback)
    timer/              1 component (active-timer-bar — persistent top bar overlay showing countdown + service name when navigating away from timer screen)
    ai/                 2 components (message-draft-sheet — bottom sheet driven by `draft_id` that consumes the `useMessageDraft` lifecycle hook (edit / send / send-edited / discard) with editable text, intent badge, recipient + trigger banner, and "Why this message" collapsible; draft-trigger-listener — global listener mounted at the root layout that subscribes to the `useDraftTriggerStore` queue + per-appointment copilot suggestions of `type === "draft_message"` and renders the sheet when a draft is pending)
    copilot/            2 components (ask-remi-fab — floating action button to open AI chat or voice copilot from active job, ai-suggestion-overlay — passive AI suggestion cards with swipe-to-dismiss during active service)
    signal/             2 components (post-card — feed post with like/comment actions, feed-filter-bar — search + type pills)
    wellness/           3 components (wellness-checkin-modal — daily mood check-in with emoji scale + streak + AI coach response, check-in-result — AI response card with celebrate/encourage/support tone variants and 8s auto-dismiss, resource-pills — tappable expo-linking pills for resource_links)
    dispatch/           1 component (dispatch-offer-modal — accept/reject incoming job dispatches)
    reorganization/     2 components (P7-FE-1) — `ai-suggestion-card` (AI session row in the Pending Reality review screen's AI tab; purple AI badge, rationale + condensed intent list, inline Approve / Decline / Counter-propose footer); `decline-reason-picker` (RHF + Zod modal reusing the §5.4.5 customer-side decline kinds with FO-facing copy + conditional 500-char `other` text input)
    profit-calculator/  Profit calculator UI — kpi-tile, accordion, detailed-results-modal (mode-aware: investor projection tab + operator "Cash Diagnostic" tab), save-scenario-modal (PM-6 name + save sheet), scenarios-modal (PM-6 "My Scenarios" pageSheet), share-link-modal (PM-6 anonymous share URL with copy + native Share), info-icon + glossary-sheet (PM-MIG-19: tap to slide up an explainer for any KPI, severity flag, or input field, sourced from the engine's PM-MIG-8 glossary), source-badge (PM-MIG-19: provenance pill — Manual today, Plaid/QBO/etc. when Phase 5 wires real data sources), controls/ (NumberInput, CurrencyInput, PercentInput, SegmentedToggle, DynamicList — NumberInput accepts optional glossaryKey + sourceProvider props), charts/ (multi-year-line-chart, revenue-pie-chart, fixed-costs-bars) — pure react-native-svg, operator-sections/ (PM-MIG-17: PeriodSection, BalanceSheetSection, UpcomingObligationsSection, ForecastPrefsSection, DateField, path-utils), operator-output/ (PM-MIG-18: SeverityFlagsList, RunwayBadge, CashBridgeView, TrappedWorkingCapitalCard, ThirteenWeekForecastList, NinetyDayCashCard — all "?" affordances now wired to the screen-level glossary sheet)
    shared/             9 components (avatar-editor, bulk-action-bar, carfax-status-badge, collapsible-section, loading-screen [auth gate only], providers, skeleton [used by all 29 data screens], status-badge, swipeable-row)

docs/
  REMI-UI-Design-Brief.md     Screen layouts, nav specs, design principles
  REMI-Feature-Spec.md        Full feature specs for every module
  REMI-Production-Plan.md     Architecture decisions, phased build plan
  DEVELOPMENT-LOG.md          Build log and decision record
```

## Calendar Feature — Data Layer

Complete data layer for the upgraded calendar system, wiring the mobile app to the backend's calendar V2 API surface. Supports franchise multi-technician dispatch and technician self-scheduling.

### Capabilities

- **Day / Week / Month views** — TanStack Query hooks for all three calendar view modes with stale-time caching
- **Appointment CRUD** — Create, update, reschedule, cancel, and no-show mutations with cross-query invalidation
- **AI Scheduling** — `useGenerateAppointment` mutation for backend-scored slot suggestions
- **Personal Events** — Role-aware CRUD hooks (technician vs. franchise owner routing)
- **Flex List** — Waitlist management with offer workflow for filling cancelled slots
- **QuickText** — One-tap customer notification templates (arrival, on-site, ahead of schedule, job complete)
- **Tax Rates** — Franchise tax rate query and upsert
- **Customer Search** — Real-time search + recent customers + quick-create for appointment forms
- **Service Catalog** — Cached service list for appointment creation
- **Route Visualization** — Types for multi-technician route map overlay
- **Daily Briefing** — Types for expanded franchise briefing with alerts and optimization suggestions
- **Calendar Store** — Zustand store with AsyncStorage persistence for view mode, zoom level, date navigation, technician filters, and map toggle

### Calendar Data Layer Files

| File | Contents |
|------|----------|
| `src/types/calendar.ts` | 30+ TypeScript interfaces mirroring backend models and payloads |
| `src/types/enums.ts` | 8 new enums: SlotType, BookingMethod, LocationType, etc. |
| `src/constants/calendar.ts` | Calendar config, slot type colors, booking labels, notification options |
| `src/constants/colors.ts` | SlotTypeColors, SlotTypeBgColors, SlotTypeLabels, CalendarAlertSeverityColors |
| `src/api/endpoints.ts` | 6 technician calendar endpoints + 25 franchise calendarV2 endpoints |
| `src/hooks/schedule/use-calendar.ts` | 6 queries + 6 mutations (day/week/month views, appointment CRUD, **`useReassignAppointment`** quick-swap with optimistic cache patching) |
| `src/hooks/schedule/use-personal-events.ts` | 3 role-aware mutations (create, update, delete) |
| `src/hooks/schedule/use-flex-list.ts` | 1 query + 2 mutations (list, add entry, offer slot) |
| `src/hooks/schedule/use-generate-appointment.ts` | 1 mutation (AI scheduling suggestions) |
| `src/hooks/schedule/use-calendar-customers.ts` | 2 queries + 1 mutation (search, recent, quick-create) |
| `src/hooks/schedule/use-calendar-services.ts` | 1 query (service catalog) |
| `src/hooks/schedule/use-reorganization.ts` | **`useFinalizeReorganizationSession`** (P3-FE-4, contract reconciled in P3-FE-12) — TanStack Query mutation hook for `POST /api/v1/technician/reorganizations/:sessionId/finalize`. Returns a `FinalizeReorganizationResult` discriminated union (`committed` / `pending_review` / `linter_rejected`); `kind` is derived from the BE's `auto_committed` boolean on 200 (NOT a `status` field — that was spec'd but never shipped), and `warnings: LinterIssue[]` rides along on success branches so `linter_warnings` are surfaced instead of dropped. 422 linter rejections resolve as data (`{ kind: "linter_rejected", issues }`), not error; missing `data.issues` on 422 falls back to `[]` with a `console.warn`. Exports `ReorganizationApiSession` (= `ReorganizationSession & { intents: ReorganizationIntent[] }`) for the BE's flat-session-plus-intents wire shape. On success invalidates `calendarKeys.all` + `dispatch-overview`; on 422 leaves caches alone (the user's draft is still locally valid). Consumed by the Pending Reality review screen. See [`docs/PLAN-DEVIATIONS.md#2026-04-24-finalize-hook-contract-reconcile`](./docs/PLAN-DEVIATIONS.md#2026-04-24-finalize-hook-contract-reconcile). **`useApplyAutoFix`** (P3-FE-9) — PATCH `/reorganizations/:id` `op: "modify_intent"` for `LinterEdgeCard`'s "Apply auto-fix" CTA. **`useCreateReorganizationSession`** / **`useAddReorganizationIntent`** / **`useCancelReorganizationSession`** (P3-FE-7) — producer-half mutation hooks the smart-default linter intercept (`useSessionAwareSubmit`) calls into. POST creates with optional `initial_intents` (one round-trip when staging from a clean slate); PATCH `op: "add_intent"` appends an intent to an open session; POST `:id/cancel` clears the active session. All carry per-call `Idempotency-Key` headers (auto-generated UUID, reused on auto-retry). **`useReorganizationSession(id)`** (P3-FE-REHYDRATE-DETAIL) — TanStack Query hook for `GET /reorganizations/:id`, keyed `["reorganizations", "session", id]` to match `useRealtimeReorganization`'s invalidation key exactly. `enabled: id != null`, `staleTime: Infinity`. Inside `queryFn` calls the shared `reconcileActiveSession(data, store)` helper on success and on a 404 (the session ended between mount and the GET, so the local draft is dead and the store gets cleared); other errors leave the store untouched. Foundation hook for FE chunk 2 (`useActiveReorganization`, `P3-FE-REHYDRATE-MOUNT`). See [`docs/implementation-plans/pending-reality-rehydration-plan.md`](./docs/implementation-plans/pending-reality-rehydration-plan.md) §6. **`useActiveReorganization()`** (P3-FE-REHYDRATE-MOUNT) — cold-start GET for `/reorganizations/mine/active`, keyed `["reorganizations", "mine", "active", franchiseId]` (franchise-namespaced so a login switch can't return a stale answer). Mounted in `app/(tabs)/_layout.tsx` adjacent to `useRealtimeReorganization()`; gates on `isAuthenticated && user.franchiseId != null` byte-for-byte with the realtime hook. `queryFn` reconciles via the shared `reconcileActiveSession(data, store)` helper so the cold-start path and the realtime path share one tested code path. THIS IS THE HOOK THAT FIXES THE EXPO GO RELOAD BUG — staged appointments now survive a cold launch. **`cacheReorganizationResult(queryClient, franchiseId, result)`** (P3-FE-REHYDRATE-MOUNT) — module-scope helper called from each mutation hook's `onSuccess` to seed the active-session + per-session query caches with the freshly-shaped row (`null` for cancel terminal). Without it every successful mutation triggers a redundant network refetch on the next render — the realtime path's prefix invalidation would otherwise force a GET of the row our own mutation just resolved. Used by `useCreateReorganizationSession`, `useFinalizeReorganizationSession` (200 only — 422 leaves the cache alone), `useCancelReorganizationSession` (writes `null`), `useApplyAutoFix`, `useAddReorganizationIntent`, `useModifyReorganizationIntent`, `useCommitIntentsBatch` (writes `null` for terminal commits, freshly-shaped row for partial commits). **`useCommitIntentsBatch`** (FE-CR-1-2, 2026-05-11) — TanStack Query mutation hook for `POST /reorganizations/:id/intents/commit-many`. Posts `{ intent_ids: number[] }` with an auto-generated `Idempotency-Key` per `mutate()` call (reused on auto-retry by the shared mutation client). Returns `{ session, intents, committedIntentIds }`; `onSuccess` branches on `session.status` — `"committed"` (terminal) clears the store + writes `null` to the active cache, while `"draft"` / `"pending_review"` (partial) updates the store with the BE-trimmed dirty intent list + caches the same so the pending-reality screen stays mounted. Always invalidates `calendarKeys.all` + `dispatch-overview` (the realtime router currently no-ops on `intents_committed_batch`). Maps the BE's two structured failures to tagged errors: `CommitBatchRejectedError` (409 `INTENT_HAS_CONFLICTS`, carries `issues: LinterIssue[]`) and `CommitBatchIntentNotFoundError` (404 `INTENT_NOT_FOUND`, carries `badIntentId: number \| null`). Consumed by the Pending Reality "Sweep clean ones" CTA (`app/pending-reality/review.tsx`) and the calendar "Apply now" CTA in `CleanIntentPromotionToast` (`src/components/calendar/clean-intent-promotion-toast.tsx`). Retires the `2026-05-09-pr-ux-20-sweep-finalizes-session` all-or-nothing gate. See [`docs/implementation-plans/pr-ux-3-followups-per-intent-commit.md`](./docs/implementation-plans/pr-ux-3-followups-per-intent-commit.md) §2.1 and [`docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-20-sweep-finalizes-session`](./docs/PLAN-DEVIATIONS.md#2026-05-09-pr-ux-20-sweep-finalizes-session). |
| `src/hooks/schedule/use-clean-intent-promotion.ts` | **`useCleanIntentPromotion`** (PR-UX-20) — selector hook that returns `cleanIntents` (mechanically-clean intent set: 1-link chain, no `LinterIssue` on the appointment, no `ChainToChainConflict` against another staged chain — the Sweep button consumes this directly) and `currentlyPromotingIntent` (the same set further filtered by per-intent suppression / per-intent snooze / system-wide cooldown / `showCleanMoveSuggestions` setting — the toast picks from this). Oldest-first ordering by `proposed_at` then `id`; pure helper `pickPromotionCandidate` extracted for unit tests. Cleanup effect clears suppression / snooze counters for intents that have left the active session. |
| `src/hooks/schedule/reconcile-active-session.ts` | **`reconcileActiveSession(data, store)`** (P3-FE-REHYDRATE-DETAIL) — pure helper that brings `usePendingRealityStore` into agreement with a BE GET response. `data == null` clears the store (or no-ops if already empty); `data` populated calls `setSession(session, intents)` (the store handles the eviction-vs-hydrate-vs-refresh branching internally). Centralized so the realtime path (`useReorganizationSession`) and the cold-start path (`useActiveReorganization`, both shipped) share one tested code path. |
| `src/hooks/schedule/use-session-aware-submit.ts` | **`useSessionAwareSubmit`** (P3-FE-7) — wrapper that gives every existing live calendar mutation the smart-default linter intercept. Runs `lintSession` on the proposed change first; if clean, fires the live mutation; if any issue is returned, opens the `LinterInterceptSheet` and routes the user's choice ("Apply anyway" / "Stage for review" / dismiss) to the appropriate downstream hook. Used by the reschedule / appointment / personal-event / cancel form sheets and by the drag callsites in the calendar tab. See [`docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer`](./docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer). |
| `src/hooks/schedule/use-calendar-world-snapshot.ts` | **`useCalendarWorldSnapshot`** (P3-FE-7, real impl D2P-FE-13) — single seam returning the `LinterWorldSnapshot` for the local linter. Assembles from the day-view query cache (`useFranchiseDayView` for FOs, `useTechnicianDayView` for technicians), filters out appointments + personal events that already have active intents in `usePendingRealityStore`, and stubs `routes` / `customerSlas` / `fleet.accounts` until those caches ship. Memoized on `[dayData, stagedAppointmentIds, stagedPersonalEventIds]` (Set references, not stringified content). |
| `src/hooks/schedule/use-calendar-display-lookups.ts` | **`useCalendarDisplayLookups`** (D2P-FE-13 follow-up) — role-aware companion to `useCalendarWorldSnapshot` returning `HumanizeLookups` (`appointmentLabels: Map<id → "Customer Name">`, `technicianNames: Map<id → "Display Name">`) projected from the same day-view cache. Consumed by `LinterEdgeCard` and `app/pending-reality/review.tsx` so the user sees customer + tech names instead of `#27026` / `tech #1487`. Reference-stable across re-renders when `dayData` is unchanged. |
| `src/stores/linter-intercept-host.ts` | **`useLinterInterceptHost`** (P3-FE-7) — Zustand singleton coordinating the `useSessionAwareSubmit` producer (deep in the render tree) with the `LinterInterceptSheet` consumer (mounted once at the calendar tab) via a Promise-based `present(issues, options?): Promise<choice>` API. Optional `options.scopeAppointmentIds: ReadonlySet<number> | null` (added 2026-05-08, `fix/linter-sheet-filter-dragged`) lets the producer scope the sheet's rendered issue list to "rows touching the dragged card / its chain", so multi-chain sessions don't dump unrelated chains' issues into the intercept. Picked over a React Context to avoid forcing every callsite below the host. See [`docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer`](./docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer). |
| `src/hooks/communication/use-quicktext.ts` | 1 role-aware mutation (send notification template) |
| `src/hooks/orders/use-tax-rates.ts` | 1 query + 1 mutation (list, upsert) |
| `src/hooks/orders/use-substitute-line-item.ts` | 1 mutation — POSTs `actual_part_number` (+ optional `reason`/`actual_description`) to substitute a part/fluid line item. Invalidates `['invoice', jobId]` on success so the invoice screen re-renders with the substituted SKU. Phase 3 Chunk 3.2. |
| `src/stores/calendar.ts` | Zustand store with view-mode, zoom, density, **`selectedTechIds`** (calendar multi-select, session-only), **`mapSelectedTechIds`** (map multi-select, session-only), and **`techOrder`** (global avatar order, persisted) |
| `src/stores/clean-intent-promotion.ts` | **`useCleanIntentPromotionStore`** (PR-UX-20) — dismissal counters and rate-limit state for the auto-promote clean-intent toast. Per-intent `count >= 2` suppression rule (involuntary, persists across launches), system-wide rate limit (5 dismissals inside a 60s sliding window trips a 5-minute cooldown; both reset on launch). `clearIntent(intentId)` lets the detection hook drop counters for intents that left the session. `recordDismissal` is the only legitimate write site — only the explicit Dismiss tap on the toast counts as a user dismissal. |
| `src/stores/clean-intent-snooze.ts` | **`useCleanIntentSnoozeStore`** (PR-UX-20) — explicit snooze decisions made via the toast's long-press snooze menu. Four options: 24h ("Snooze for this card"), 1h, end-of-local-day ("Snooze today" — pinned to next-midnight via the exported pure `endOfLocalDayMs` helper to avoid the "+24h at 11:50pm" bug), and session-only ("Snooze for this session" — non-persistent flag that resets on launch). Per-intent map persists across launches. `isIntentSnoozed(intentId)` honors both the per-intent map and the session flag; lazy-purges past entries on read. |
| `src/stores/clean-intent-settings.ts` | **`useCleanIntentSettingsStore`** (PR-UX-20) — user preferences for the auto-promote clean-intent flow. Two persisted toggles: `showCleanMoveSuggestions` (default ON; gates the calendar-tab toast surface) and `confirmBeforeApplyingCleanMoves` (default OFF; defers toast Apply to a confirmation alert). Mirrors the `useAccessibilityStore.preferredHand` Zustand-persist + AsyncStorage pattern. Surfaced in `app/settings.tsx` under the new "Calendar Suggestions" section. |
| `src/stores/pending-reality.ts` | **`usePendingRealityStore`** (P3-FE-1) — active reorganization session, staged intents, last local linter run. One active session per device (different `setSession` id evicts previous; same id refreshes). NOT persisted — pending intents live on the backend after `saveDraft`. `runLocalLinter(worldSnapshot)` is caller-supplied so the store stays cache-free. Trimmed contract — see [`docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim`](./docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim) |
| `src/hooks/calendar/use-pending-change-overlay.ts` | **`usePendingChangeOverlay`** (P3-FE-8) — selector hook + pure `computePendingChangeOverlay` helper that resolves whether a given `CalendarAppointmentItem` has any active reorganization intents staged against it. Merges the BE-side `pending_intent_summary` annotation (P6-BE-9) with the local `usePendingRealityStore.intents` slice; **local intents win on conflict** so a freshly-staged change paints the overlay immediately without waiting for a BE refetch. Returns `{ isPending, source, kinds, intentCount, mostRecentSessionId }`; emits the empty result when neither source has a hit. The pure helper is consumed by the three calendar wrappers' memoized `eventStyleOverrides` callbacks (which can't call hooks) and by the tap-route branches in `app/(tabs)/index.tsx`. |
| `src/components/calendar/PendingChangeBadge.tsx` | **`PendingChangeBadge`** (P3-FE-8) — 12pt source-badge slot mounted via the vendored library's `eventSlots.TopRight` extension point. Self-no-ops for personal events / drafts (which never carry a `pending_intent_summary`). Subscribes to `usePendingChangeOverlay` so an intent staged on this device paints the badge immediately. Icon glyph picks per `PendingIntentSummarySource` (tech_app → pencil, franchise_app → person, customer_app → headset, ai_engine → sparkles, mixed → layers); `+N` count pill renders next to the badge when `intentCount > 1`. Background = `StatusColors.scheduled`. |
| `src/components/calendar/pending-change-overlay-style.ts` | **`applyPendingChangeBorderOverride`** (P3-FE-8) — pure helper invoked from each calendar wrapper's `eventStyleOverrides` to layer a 1.5pt dashed `StatusColors.scheduled` border on top of the slot's existing container styling when the appointment has any pending intents. Composes with the existing tech-color / draft / personal-event treatments; takes the local-intents subset and `localSessionId` as arguments since hooks can't run inside `useCallback`. |
| `src/stores/use-sheet-draft-store.ts` | **`useSheetDraftStore`** (P3-FE-6) — session-scoped Zustand slice keyed by `(cacheKey, sheetKind)` that holds the in-flight RHF (or `useState`) snapshot for the five calendar form sheets so typed contents survive implicit close (tap-outside, swipe-down, navigation away). NOT persisted to AsyncStorage — typed text is gone on app reload by design. Companion hooks in `src/hooks/calendar/use-sheet-draft-cache.ts` (`useSheetDraftRead` for one-shot `defaultValues` seeding, `useSheetDraftWrite` for debounced writes with unmount-flush, `clearSheetDraft` for save-success / cancel-CTA clears) and a single `sheetDraftCacheKey` helper centralising the key convention (`draft:`, `appt:`, `pe:`, `reschedule:`, `cancel:`, `generate`). `useCalendarStore.dismissDraft` and `createDraft` evict the matching bucket via `clearForDraft` so dismissed/replaced drafts never leak typing. Kept deliberately separate from `usePendingRealityStore` and `useCalendarStore.pendingDraft` per [`docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft`](./docs/PLAN-DEVIATIONS.md#2026-04-21-rotation-sideways-draft). |
| `src/components/shared/tech-avatar-chip.tsx` | Reusable initials-or-image avatar chip used by the franchise route map legend |
| `src/components/sheets/AppSheet.tsx` | **`AppSheet`** (LDM-WAVE-2 CHUNK-2, alias `SHEETS-1`) — canonical wrapper around `@gorhom/bottom-sheet`'s default export. Renders the sheet inside a positioned half-width `<View>` in landscape (left or right per `dropX` / `tapX` / `defaultSide`), unwrapped full-width in portrait. Locks down the *"sheets are never full-width in landscape"* invariant: portrait always returns `"full"` regardless of `forceSide`, with a `__DEV__` warning if a caller tries to override. Every `<BottomSheet>` consumer in the app routes through this primitive — the `no-restricted-imports` ESLint rule on `@gorhom/bottom-sheet` blocks direct imports outside this file. Supersedes the per-caller `containerStyle` workaround that `AppointmentDetailSheet` ran on its own (PLAN-DEVIATION `2026-04-22-half-width-detail-sheet`, now Resolved). |
| `src/components/sheets/use-sheet-side.ts` | **`resolveSheetSide`** + **`useSheetSide`** (LDM-WAVE-2 CHUNK-2) — pure side resolver consumed by `AppSheet`. Portrait → always `"full"`; landscape → `forceSide` → `dropX`/`tapX` vs. `screenWidth/2` → `defaultSide` → `"right"`. Tested against the locked invariants in `__tests__/use-sheet-side.test.ts`. |
| `src/components/sheets/index.ts` | Barrel export for the sheets primitive. Re-exports `AppSheet`, `useSheetSide`, `resolveSheetSide`, plus `type AppSheetRef` so consumers can `useRef<AppSheetRef>(null)` without touching the restricted gorhom default-export import. |
| `src/components/route/appointment-marker.tsx` | **`AppointmentMarker`** (LDM-WAVE-2 CHUNK-4) — wraps `react-native-maps`' native `<Marker>` for an appointment pin. Single-tap → `onActionsPress(stop, route)` so the parent opens `<MarkerContextMenuSheet>`. **Pin dragging is fully off** — renamed from `<DraggableAppointmentMarker>` (`draggable-appointment-marker.tsx`) in snap-zone Phase 7h (2026-05-22) when the LDM-WAVE-2 CHUNK-3 pin-drag pathway was deleted (same-route reorder moved to the chip-bar snap-zone rescheduler; cross-tech reassign moved to the menu's "Reassign…" → `<MarkerReassignPickerSheet>`). See PLAN-DEVIATIONs [`2026-05-22-snap-zone-replaces-pin-drag`](./docs/PLAN-DEVIATIONS.md#2026-05-22-snap-zone-replaces-pin-drag) (the removal) and [`2026-05-17-marker-context-menu-passthrough-only-reassign`](./docs/PLAN-DEVIATIONS.md#2026-05-17-marker-context-menu-passthrough-only-reassign) (the menu surface). |
| `src/components/route/marker-context-menu-sheet.tsx` | **`MarkerContextMenuSheet`** (LDM-WAVE-2 CHUNK-4, `DRAG-3-CONTEXT-MENU`) — 4-row action menu (View details / Reschedule… / Reassign… / Cancel) opened from a marker's Callout-Actions tap. Built on `<AppSheet>`. Currently only the Reassign row is fully-wired — see PLAN-DEVIATION `2026-05-17-marker-context-menu-passthrough-only-reassign`. |
| `src/components/route/marker-reassign-picker-sheet.tsx` | **`MarkerReassignPickerSheet`** (LDM-WAVE-2 CHUNK-4) — tech picker for the Reassign… menu row. Radio list of `<TechAvatarChip>` rows (sender excluded, default selection is next-in-techOrder). On confirm fires `useReassignAppointment` with the same payload shape CHUNK-3's drag-driven cross-tech path uses. |
| `src/hooks/route-map/use-route-stop-swap.ts` | **`useRouteStopSwap`** (chip-bar snap-zone Phase 4, 2026-05-21) — pairwise swap mutation wrapping `POST /api/v1/franchise/routes/:routeId/stops/swap` extended with per-side `aTime` / `bTime` + a notify-customer flag (Phase 3 BE work). Powers the chip-bar SWAP zone gesture: drop chip A onto chip B → `<DragRescheduleSheet>` opens in `kind: "swap"` and Save fires this mutation. Optimistic cache patch updates both stops' positions + times. See [`docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet`](./docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet). |
| `src/hooks/route-map/use-route-stop-reposition.ts` | **`useRouteStopReposition`** (chip-bar snap-zone Phase 6, 2026-05-22) — atomic single-stop reposition mutation wrapping `PATCH /api/v1/franchise/routes/:routeId/stops/:stopId/reposition`. Updates ONE stop's `stop_order` to a new position, writes the new `scheduled_time` + derived `scheduled_end_time`, and shifts every other stop between old + new by ±1 to keep the sequence contiguous. Powers the chip-bar INSERT zone gesture (including off-end drops, where the window falls back to the dispatcher-day-start / -end constants). Shipped as Option 5b (new endpoint) — see [`docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet`](./docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet). |
<!-- `src/hooks/route-map/use-marker-drop-dispatcher.ts` was deleted in snap-zone Phase 7h follow-up (2026-05-22) when pin dragging was removed entirely. See PLAN-DEVIATIONS.md#2026-05-22-snap-zone-replaces-pin-drag. -->
| `src/components/route/drag-reschedule-sheet.tsx` | **`<DragRescheduleSheet>`** (chip-bar snap-zone Phase 2 / 4 / 6) — dual-mode mini-rescheduler. `kind: "insert"` shows one picker bounded by `[leftNeighbor.scheduledEndTime, rightNeighbor.scheduledTime]`. `kind: "swap"` shows two pickers side-by-side, each bounded by the OTHER chip's pre-swap neighborhood with the OTHER chip's pre-swap start as the default. Both modes carry a per-side duration stepper (±15 min, B2-7) and an inlined Notify-customer toggle in the action row. See [`docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet`](./docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet). |
| `src/components/route/review-plan-sheet.tsx` | **`<ReviewPlanSheet>`** (chip-bar plan-mode B2-4) — batched-plan review for chip-bar Plan Mode. Renders one row per staged `PlannedMove` with an editable per-row time stepper + duration stepper + Remove affordance; per-row commit-status badges (`pending` / `inFlight` / `committed` / `failed`) during the sequential commit walk. Presentational; parent owns the queue. See [`docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch`](./docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch). |
| `src/utils/chip-bar-snap-zone.ts` + `chip-bar-snap-zone-constants.ts` | **`classifySnapZone`** (Phase 7b, 2026-05-22) — pure, `'worklet'`-marked classifier extracted from `<RouteReorderChipBar>`'s `useDerivedValue`. Returns a `SnapZoneDecision` discriminated union (`swap` / `insert` / `noop`) covering SWAP zone (±9px of any chip center), INSERT zone (gap between chips OR off the front / back of the bar), and NOOP guards. 22 unit tests in `__tests__/chip-bar-snap-zone.test.ts` lock in every edge case. |
| `src/utils/route-reschedule-windows.ts` | **`computeSwapWindow`** + **`computeInsertWindow`** (Phase 2 / 4 / 6) — pure per-side window-derivation helpers consumed by `<DragRescheduleSheet>`. INSERT mode falls back to `DISPATCH_DAY_START_HHMM` / `DISPATCH_DAY_END_HHMM` when a neighbor is null (off-end drop). 24 tests. |
| `src/utils/route-plan-moves.ts` | **`PlannedMove`** type + dedupe rule (B2-2) + **`applyPlannedMoves(stops, moves) → stops[]`** pure reducer (B2-3). The chip bar and focused-route polyline both derive their visible order from this reducer while Plan Mode is active, so the dispatcher sees the route reshape in real time without any BE call. See [`docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch`](./docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch). |
| `src/utils/route-plan-commit.ts` | **`commitPlanSequentially`** (B2-5) — pure async walker that fires each `PlannedMove` through its appropriate per-move BE mutation one at a time, awaiting + cache-invalidating between each so the next move's window math reads settled state. Stops on the first failure, leaving the remaining moves un-attempted so the dispatcher can edit + retry. See [`docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch`](./docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch). |
| `src/components/linter/severity-badge.tsx` | **`SeverityBadge`** (P3-FE-5) — small colored pill mapping `LinterIssue.severity` to the standard `StatusColors` palette (error → `paymentDue`, warning → `scheduled`). |
| `src/components/linter/auto-fix-button.tsx` | **`AutoFixButton`** (P3-FE-5) — primary "Apply suggested fix" CTA when `suggestedAutoFix` is supplied; disabled "No auto-fix available" otherwise. Parent owns the keep-don't-replace mutation per master plan §4.8. |
| `src/components/linter/linter-edge-card.tsx` | **`LinterEdgeCard`** (P3-FE-5; visual reconciliation P3-FE-10) — composes verbatim `humanMessage` + linkified affected appointment IDs (`router.push('/order/${id}')`) + optional `AutoFixButton`. Two chromes off one prop: `showKindLabel` (default `false`) → **nested mode** for the review screen (top separator + 3pt left severity accent + subtle tint, no outer border / radius / shadow, no header row — stacks flush under `IntentCard`); `showKindLabel` (true) → **standalone mode** for the `_dev` screen and the C.3 / C.4 indicator popovers (full chrome + `SeverityBadge` + KIND_LABEL header). |
| `src/components/calendar/PendingRealityFAB.tsx` | **`PendingRealityFAB`** (P3-FE-2) — portrait-only floating action button (56pt, bottom-right, lifted above the tab bar) that surfaces the active Pending Reality session. Subscribes to `usePendingRealityStore` via slice selectors; tints by worst-severity linter scan (clean → `StatusColors.finalized`, warning → `scheduled`, error → `paymentDue`); shows the intent count in a top-right badge clamped to `9+`. Self-gates on `useWideCanvas().orientation === "portrait"` (the landscape HUD is `P3-FE-3`). Tap → `/pending-reality/review`. The `heldDraft != null` branch from the chunk prompt is intentionally omitted — see [`docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim`](./docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-trim). |
| `app/pending-reality/review.tsx` | **Pending Reality review (dual-mode + AI)** (P3-FE-4, P7-FE-1; master plan §5.2.3 / §5.2.5 / §5.3.5) — full-screen route opened by the FAB / HUD. Two tabs always present: **Final state** (one card per intent, grouped by target, with per-intent `LinterEdgeCard`s inline) and **Sequence of operations** (intents sorted by §6.4.1 commit order with step badges + Modify/Remove CTAs). A third **AI** tab (P7-FE-1) appears for `UserRole.FRANCHISE_OWNER` / `FRANCHISOR` users with a violet badge counting pending AI sessions; renders one `<AiSuggestionCard>` per `useAiSuggestionSessions()` row with inline Approve / Decline (via `<DeclineReasonPicker>`) / Counter-propose (info-alert routing the FO to the calendar v1 placeholder) buttons. Sticky bottom action bar: "Cancel session" (fires `useCancelReorganizationSession` so the BE marks the session `cancelled`; the hook's `onSuccess` clears the store + writes `null` into the active-session cache so the rehydration polling can't resurrect the draft, then dismisses) and "Finalize" (fires `useFinalizeReorganizationSession`; on 200 clears the store + routes back to the calendar tab — if the BE returned non-empty `linter_warnings` an `Alert.alert` lists them before dismissing; on 422 surfaces server-side `LinterIssue[]` inline on the affected Sequence rows + auto-flips to Sequence). Empty state with "Start drafting" CTA when `intents.length === 0`. **PR-UX-20 (2026-05-09):** when ≥2 intents are staged AND every staged intent is mechanically clean (1-link chain, no linter conflicts, no cross-chain destination overlap), a tonal-green **Sweep N clean moves** button is rendered above the Sequence list; tap dispatches finalize / authorize for the whole session and shows a count-summary alert. Hidden whenever any dirty intent is staged so the gate never silently commits an unintended change. The Final state tab is a card list, not a `WorkweekView` mount — see [`docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-final-state-cards`](./docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-final-state-cards). The AI tab ships as a list-with-inline-actions, not a single-session deep-dive — see [`docs/PLAN-DEVIATIONS.md#2026-04-24-ai-tab-list-only-render`](./docs/PLAN-DEVIATIONS.md#2026-04-24-ai-tab-list-only-render). Routed via `app/pending-reality/_layout.tsx` (Stack header, Pending Reality title). |
| `src/screens/_dev/LinterPrimitivesExample.tsx` | **`LinterPrimitivesExample`** (P3-FE-5) — `__DEV__`-gated visual smoke screen with one card per `LinterIssueKind`. Not under `app/`, so not auto-routed; mount via a temporary route file or Storybook host. |
| `src/screens/settings/ReorganizationPolicyScreen.tsx` | **`ReorganizationPolicyScreen`** (P7-FE-1, master plan §2.5 / §3.6) — per-franchise editor for the `franchises.reorganization_policy` JSONB column. RHF + Zod with one switch per editable bucket (3 tech + 3 customer combinations of source × scope). The `ai_authored` row is rendered as a read-only "Always FO review" badge per the §2.5 v1 hard-pin (BE rejects any PATCH that attempts to change it). Save button is `disabled={!isDirty || isPending}` — the form starts not-dirty after hydration. PATCHes the full `ReorganizationPolicy` shape via `useUpdateReorganizationPolicy` so `ai_authored` always rides through unchanged. Routed via `app/settings/reorganization-policy.tsx` with an FO-only access guard (`UserRole.FRANCHISE_OWNER` / `FRANCHISOR`); non-FO callers see a `NonFranchiseOwnerFallback`. Linked from `app/settings.tsx` in the FO-only section. The matching `GET` / `PATCH /api/v1/franchise/settings/reorganization-policy` BE handlers ship in a sibling REMIBackend PR — see [`docs/PLAN-DEVIATIONS.md#2026-04-24-policy-be-sibling-deferred`](./docs/PLAN-DEVIATIONS.md#2026-04-24-policy-be-sibling-deferred) for the cross-repo split rationale. |

## Calendar Feature — UI Layer

24 custom components in `src/components/calendar/` powering the full visual layer (16 portrait + 8 landscape under `landscape/`). Both franchise owner and technician views use `react-native-resource-calendar`. The main calendar screen (`app/(tabs)/index.tsx`) routes by role; in landscape, the franchise-owner branch swaps to `LandscapeWorkweekView` and the bottom tab bar + header are hidden via `app/(tabs)/_layout.tsx`.

### Components

| Component | Purpose |
|-----------|---------|
| ~~`calendar-event-block.tsx`~~ | Removed — was the `@howljs/calendar-kit` custom renderer. Event rendering is now handled by `react-native-resource-calendar` internals |
| `calendar-header.tsx` | View mode toggle (Day/Week/Month), date nav arrows, "Today" button, map toggle, density toggle, "+New" FAB, gear button for Quick Settings |
| `calendar-quick-settings-sheet.tsx` | In-calendar bottom sheet with Calendar Display Hours stepper, Fit-to-events toggle, and "More in Settings →" deep-link. Opened by the gear icon on both franchise and technician calendars. Exports `confirmStrictMode()` helper used by both this sheet and the full Settings screen for the strict-mode warning Alert |
| `calendar-range-row.tsx` | Reusable chevron stepper row for minute-of-day values (used by Settings and Quick Settings) |
| `calendar-overview-bar.tsx` | Dispatch summary stats (Active, Done, Pending, Delayed) for franchise owners |
| `appointment-detail-sheet.tsx` | Bottom sheet with full appointment detail, service/tax totals, alerts, action buttons |
| `appointment-form-sheet.tsx` | Customer search, service multi-select, slot type, notification preference, date/time picker |
| `reschedule-sheet.tsx` | Old→new time comparison, notification preference, custom message, confirm |
| `cancel-sheet.tsx` | Cancellation reason, notification preference, triggers Flex List match on success |
| `personal-event-form-sheet.tsx` | Create/edit/delete personal calendar events |
| `event-type-chooser-sheet.tsx` | Two-option bottom sheet (Customer appointment / Personal event) shown after a long-press release on an empty calendar cell. Used by both franchise and technician calendars to route the user into the correct form sheet |
| `linter-intercept-sheet.tsx` | **`LinterInterceptSheet`** (P3-FE-7) — smart-default linter-intercept sheet mounted once at the calendar tab level. Subscribes to `useLinterInterceptHost`; opens when the producer (`useSessionAwareSubmit`) calls `present(issues, { scopeAppointmentIds })`. Body is a stack of nested `LinterEdgeCard`s — filtered (2026-05-08, `fix/linter-sheet-filter-dragged`) to issues whose `affectedAppointmentIds` intersects the producer-supplied scope set, so a drag into chain A doesn't surface chain B's overlap rows. Footer is "Apply anyway" (secondary) + "Stage for review" (primary, default). ESC / backdrop tap drops the live mutation entirely. Visual rhythm matches `event-type-chooser-sheet.tsx`. See [`docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer`](./docs/PLAN-DEVIATIONS.md#2026-04-24-smart-default-intent-producer). |
| `quicktext-sheet.tsx` | 4 template buttons (Arriving, On Site, Ahead of Schedule, Complete) with cooldown tracking |
| `generate-appointment-sheet.tsx` | AI scheduling — customer/service input → scored slot cards with "Book This Slot" |
| `flex-list-sheet.tsx` | Waitlist entries with "Offer Slot" action, inline add form |
| `month-view.tsx` | Month grid with per-day appointment counts and capacity indicators (green/yellow/red) |
| `alert-badge.tsx` | Colored severity dot on event blocks |
| `slot-type-indicator.tsx` | Pill badge for slot type (Standard, Eco, Priority, Flex) |
| `resource-calendar-day-view.tsx` | Day view wrapper for `react-native-resource-calendar` — used by both franchise owner (multi-tech) and technician (single column). Wires `selectedTechIds` and reorder/double-tap callbacks into the vendored library fork |
| `resource-calendar-workweek-view.tsx` | Mon–Thu per-technician workweek view with week navigation |
| `landscape/LandscapeWorkweekView.tsx` | **P2-FE-4 + P2-FE-7** — landscape variant of the franchise workweek canvas (master plan §5.1.1). Full-bleed grid with hidden tab bar + header, vertical 44pt avatar strip on the `useAccessibilityStore.preferredHand` edge, and selection-cardinality-driven render: 0 selected → empty grid (long-press creates), 1 → status palette, 2+ → overlay mode using `colorForTech(card.technician_id)`. Includes 200ms map/grid cross-fade mode (`FranchiseRouteMap fullBleed`) driven by `MapToggleButton`; in map mode the same avatar strip filters visible routes. As of LDM-WAVE-1 CHUNK-6, the map mode also renders a `<MapPillRow>` via the `FranchiseRouteMap.renderTopChrome` slot with a single live-routes-count pill (filter-aware).
| `landscape/MapPillRow.tsx` | **LDM-WAVE-1 CHUNK-6** — scaffold for the landscape map's top-edge pill row. Horizontal scroll-view of capsule pills, 44pt min hit-target per pill, three tone variants (`neutral` / `live` / `warning`). Accepts a `MapPillDescriptor[]` with `id`/`label`/optional `icon`/`onPress`/`tone`. CHUNK-6 ships a single live-routes-count descriptor; future feature chunks (drag-treatment toggle, AI-suggested-reorder banner, customer-intake-pin chip, drawer-trigger pill) plug in via the same array |
| `landscape/MapToggleButton.tsx` | **P2-FE-7** — top-corner `EdgeTab` map/grid toggle anchored opposite the avatar strip (preferred hand aware: right-hand → top-left, left-hand → top-right). Handle stays visible with 44pt touch target; opening the panel exposes explicit `Map` / `Grid` segment actions |
| `clean-intent-promotion-toast.tsx` | **`CleanIntentPromotionToast`** (PR-UX-20) — auto-promote toast for a single, conflict-free, 1-link reschedule intent. Half-width side-pinned popup that mirrors the `ChainToChainConflictToast` PR-UX-19 pattern (reuses `useDynamicPopupSide`); appears on the half OPPOSITE the intent's destination so the destination tile stays visible. 8s auto-dismiss with a thin animated progress bar. Apply now / Remove / Dismiss action row, plus a long-press inline snooze panel (4 options: 24h, this session, 1h, today). Post-apply 6s confirmation with Undo (modify_intent → restore source slot). Self-gates on `useCleanIntentPromotion`; renders nothing when no clean intent qualifies. Settings-aware via `useCleanIntentSettingsStore.showCleanMoveSuggestions`. See [`docs/DEVELOPMENT-LOG.md` PR-UX-20 entry] for the full machinery. |
| `landscape/PendingRealityHUD.tsx` | **P3-FE-3** — landscape entry point into the Pending Reality review screen (master plan §5.2.2 + chunk-prompt C.4 in §8.8). 44pt pill anchored to the corner OPPOSITE the avatar strip — same edge as `MapToggleButton`, vertically stacked beneath the map toggle handle. Shares the FAB's data + tint rules: subscribes to `usePendingRealityStore` via slice selectors, tints by worst-severity linter scan (clean → green, warning → yellow, error → red), shows the intent count both inline and in a corner badge clamped to `9+`. Self-gates on `intents.length === 0` so it can be mounted unconditionally inside `LandscapeWorkweekView`. Tap → `/pending-reality/review` (same route as the FAB). Placement deviates from the §5.2.2 in-strip slot — see [`docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-hud-opposite-edge`](./docs/PLAN-DEVIATIONS.md#2026-04-23-pending-reality-hud-opposite-edge) |
| `FloatingDraftCard.tsx` | **P2-FE-5 (course-corrected 2026-04-21)** — backdrop + chooser-popover overlay for the tap-to-create draft flow. Replaced the original orientation/snapshot model (long-press + 30s resilience window) with a persistent `pendingDraft` slice in `useCalendarStore`. Exports `SYNTHETIC_DRAFT_EVENT_ID` (sentinel id `-1`), `isDraftSyntheticEventId` guard, and the `useResourcesWithDraft(resources)` hook that splices the draft into the matching tech's events array so the vendored calendar handles rendering / positioning / drag-to-move natively. Tap empty cell → dashed block; tap dashed block → chooser popover; tap "Customer Appointment" / "Personal Event" → form sheet pre-filled with the draft's date / time / tech. Tap-outside dismisses the popover first, then the draft. Survives orientation changes indefinitely. Mounted once per calendar root (FO + tech) in `app/(tabs)/index.tsx`. See PLAN-DEVIATIONS `2026-04-21-tap-to-create-draft` and `2026-04-21-rotation-sideways-draft` |
| `landscape/avatar-strip.tsx` | **P2-FE-4 + P2-FE-6** — vertical 44pt strip (34pt avatar + 5pt padding × 2) rendering `TechAvatarChip` per available tech. Tap toggles the tech in `useCalendarStore.selectedTechIds`; optional long-press focuses (clears + selects single). Per-tile `AvatarStripSlot` sub-component hosts the P2-FE-6 highlight ring (`useAnimatedStyle` reading `dragHighlightedTechIdSV`) and reports its window-relative bbox to `onTileLayout` (`measureInWindow`) so `useDragToAvatar` can hit-test the dragged centroid |
| `landscape/use-drag-to-avatar.ts` | **P2-FE-6** — landscape-only hit-test coordinator. Reads `panXAbs`/`panYAbs`/`isDragging` from the vendored calendar (`useDragSharedValues`, FORK Phase 18), converts the calendar-viewport-local centroid to window space using the wrapper's `measureInWindow` origin, and writes the matching tech id (or `NO_HIGHLIGHTED_TECH = -1`) into `highlightedTechIdSV` per frame on the UI thread. A second `useAnimatedReaction` snapshots the highlight on `isDragging` true→false (drop) into `lastHighlightedTechIdRef` for the JS-side drop handler to consume |
| `landscape/use-pending-reality-stub.ts` | **P2-FE-6 (P3-FE-1 stub)** — local hook with `{ intents, addReassign(apptId, fromTechId, toTechId), clear }` and a 30-second TTL sweep on a 5s GC interval. Stand-in for the future `usePendingRealityStore`; the `addReassign` payload `{ kind: "reassign", appointmentId, fromTechId, toTechId, createdAt }` matches the planned store API for a one-import swap. Consumed by `LandscapeWorkweekView`'s `DragEndAvatarIntercept` for real-event drop-on-avatar reassign intents |
| `landscape/diagonal-stripe-overlay.tsx` | **P2-FE-4** — `react-native-svg` diagonal-stripe overlay used to differentiate personal events from work events when in overlay mode (master plan §5.1.4) |
| `landscape/use-calendar-tab-orientation.ts` | **P2-FE-4** — `useFocusEffect` wrapper that calls `allowAllOrientations()` on calendar tab focus and `lockToPortrait()` on blur (P0-FE-3 wrappers). The calendar tab is the only screen allowed to rotate; every other screen stays portrait-only because it inherits the lock from the most recent blur |
| `swap-toast.tsx` | Reanimated slide-up toast with Undo button for the quick-swap fast path; 5 s auto-dismiss |

### Interaction Model

- **Drag-to-move** — Long-press any card, then drag to a new time slot or technician column. Opens a confirmation sheet with old→new comparison and notification options. 250ms gesture settle delay prevents the bottom sheet from catching residual drag events
- **Pinch-to-resize** — While a card is selected (long-press), pinch with two fingers to change duration. Mutual exclusion: pan is blocked during pinch, pinch is blocked during pan
- **Pinch-to-zoom** — When no event is selected, pinch to zoom the calendar. Viewfinder model: content always fills the screen. Zoom out reveals more technicians and shorter hours; zoom in returns to default view. Bounded so 13 visible hours (5 AM – 6 PM) always fill the viewport
- **Small-event handling** — Events < 15 min render at a minimum 22px height with expanded touch targets. Drag overlays are inflated for visibility. Original event duration is preserved on move; only pinch-resize changes duration
- **Tap event → detail sheet** — Single tap opens appointment detail; long-press initiates drag
- **Long-press empty cell → drag-to-create with ghost preview** — Press-and-hold any whitespace slot to spawn a translucent dashed-blue ghost appointment card under your finger; drag it to any time/column and release to open the creation sheet pre-filled with the slot the ghost landed on (franchise: customer-appointment form with technician column; technician: personal-event form). Inherits the library's snap-to-5-min, snap-to-column, and edge auto-scroll for free
- **Inline "Add new customer" in the appointment form** — When creating an appointment, the customer picker shows a blue "+ Add new customer" row beneath search results. If the search query had no matches, the row label becomes `Add "<query>" as new customer` and tapping it expands an inline mini-form (first/last/phone/email) pre-filled with the typed name. On save, the new customer is auto-selected without leaving the appointment flow
- **Single-tap technician avatar → multi-select filter** — Toggles that tech in `selectedTechIds` (session-only). Header keeps showing all avatars; selected get a blue ring, unselected dim. Body collapses to selected columns and remaining columns reflow wider. Empty selection = all visible
- **Double-tap technician avatar → workweek view** — Enters Mon–Thu per-technician view with week navigation
- **Long-press technician avatar → drag-to-reorder** — 300 ms hold pops the avatar (scale + shadow + haptic) and starts a horizontal pan; release commits the new order to `techOrder` (persisted to AsyncStorage). Other avatars shift live during the drag
- **Drag appointment between two selected techs (same date+time) → quick-swap toast with Undo** — Skips the Reschedule sheet for tech-only swaps inside the current multi-select. Optimistic update on the calendar cache plus a 5 s slide-up `SwapToast` with an Undo button. Anything else (date change, time change, tech outside the selection) still opens the Reschedule sheet
- **Swipe up on top section (or tap the grab-handle pill) → collapse the briefing + header + overview to give the calendar grid full-screen room.** Vertical Pan with `activeOffsetY([-8, 8])` so taps and horizontal gestures pass through. Snap-on-release based on position + velocity. Collapse state is session-only — fresh app launch is always expanded. Franchise calendar only for now
- **Workweek tech switcher strip** — Inside Workweek view, a horizontal row of small tech-avatar chips sits at the top of the section (above the "← Day View / Tech Name" title row). The current tech is highlighted; tap any other to swap which tech the Workweek shows without exiting back to Day view. Sorted by the same persisted `techOrder` the Day view header uses; centered when chips fit, scrolls horizontally when they don't
- **Lazy-mounted sheets** — Only the active bottom sheet is rendered at any time (0-1 instances vs. the original 8 simultaneous mounts). RescheduleSheet mounts at `index={0}` (immediately visible) to avoid snapToIndex race conditions
- **Local datetime strings** — All frontend↔backend datetime communication uses `YYYY-MM-DDTHH:mm:ss` (no timezone suffix) to avoid UTC offset bugs

## Calendar Feature — Bug Fixes & Interaction Polish

Post-integration fixes addressing runtime crashes, performance, gesture conflicts, and timezone issues discovered during end-to-end testing.

### Performance

- **Lazy-mount sheets** — Switched from 8 always-mounted `@gorhom/bottom-sheet` instances to conditional rendering with a single `activeSheet` state
- **Reanimated logger** — Suppressed `@howljs/calendar-kit` strict-mode warning spam via `configureReanimatedLogger({ strict: false })` in `app/_layout.tsx`
- **Query retry cap** — Set `retry: 1` on V2 calendar hooks to prevent retry storms on backend errors
- **Immutable cache updates** — Rewrote `applyRescheduleToCache` to produce new object references at every nesting level for proper React Query re-renders

### Interaction Fixes

- **Timezone fix** — Replaced `toISOString()` (UTC) with `dayjs().format("YYYY-MM-DDTHH:mm:ss")` (local) across all reschedule flows
- **Tap vs. drag separation** — `selectedEvent` is only set during active drags (`onDragEventStart`), not on tap. Taps go directly to the detail sheet
- **Week view background tap** — Disabled `onPressBackground` for week view to prevent gesture stealing from event taps
- **Reschedule from detail view** — Pre-populates `rescheduleData` with current appointment time so the confirm button works
- **BottomSheet gesture fix** — `TouchableOpacity` from `@gorhom/bottom-sheet` (not `react-native-gesture-handler`) for buttons inside sheets; `BottomSheetTextInput` for text fields
- **Duration persistence** — Dragged end time is preserved through the reschedule flow and saved to `scheduled_end_time`
- **`NO_SHOW` status** — Added to `AppointmentStatus` enum and `StatusColorMap`
- **Extended timeline** — Day view renders through 10 PM (`end={1320}`) instead of cutting off at 8 PM
- **Resource scrolling** — Day view supports horizontal scrolling through technician columns with `enableResourceScroll`
- **RescheduleSheet visibility** — Changed BottomSheet from `index={-1}` (closed, snap-to-open) to `index={0}` (immediately visible on mount). Removed dynamic `key` prop that forced remounts and broke snapToIndex on fresh BottomSheet instances
- **Drag gesture settle** — 120ms delay between draft detection and sheet mount prevents the BottomSheet's `enablePanDownToClose` from catching the residual drag-end gesture
- **Floating-point drag guards** — `Math.round()` on clamped from/to values, `Number.isFinite()` fallbacks, `dayjs().isValid()` abort gate
- **DraggedEventDraft cleanup** — `useDraggedEventDraftSubscription` immediately clears both `DraggedEventDraft` and `selectedEvent` from the library store to exit drag-mode overlay

### Defensive Guards

The frontend guards against incomplete backend data so it never crashes on missing fields:
- `appt.services ?? []`, `appt.alerts ?? []`, `appt.tax_lines ?? []` in event mapping and detail sheets
- `dayjs(datetime).isValid()` check before creating calendar events — invalid dates are skipped

## Multi-Tech Move-Chain Demo Mode (PR-UX-3)

Demo / FO-only authoring affordance for visualizing and walking a multi-technician cascade chain on the portrait workweek calendar. Builds on PR-UX-2's single-tech move-chain selector with three additions: a 3-tech 7-step dev seed, side-arrow link-by-link navigation that remounts the calendar onto each step's source-tech, and portrait drag-to-avatar reassignment.

### Capabilities

- **3-tech 7-step seed** — `app/pending-reality/review.tsx` exposes a "Seed cascade chain (multi-tech, 7-step)" dev button next to the original single-tech seed. Produces a `Josh → Todd → Josh → Todd → Trey → Josh → Trey` sequence over 4 days that exercises every cross-tech transition pattern.
- **Side-arrow link-by-link navigation** — When a chain chip is isolated, two chevron `Pressable`s flank its per-step dot row. Tapping `›` advances to the next link (wrapping at end-of-chain); tapping `‹` reverses (wrapping at start). Single-step chains disable both. The vendored calendar remounts onto each step's source-tech via `enterWorkweek()` if the active step changes the mounted tech.
- **600ms tech-name flash overlay** — Cross-tech remounts surface a fade-in / hold / fade-out "Now viewing {Name}" banner sourced from `useSideArrowTechMount.flashKey`. Same-tech transitions (e.g. Josh→Josh on a same-tech step) do NOT flash. Single-tech chains never flash, preserving the PR-UX-2 single-tech regression.
- **Per-tech ghost filtering** — `useResourcesWithMoveChainGhosts` accepts an optional `activeTechId` parameter so the workweek view (which mounts one tech at a time) only paints ghosts for the currently-mounted tech, not the off-tech links that would otherwise leak into the grid.
- **Grey terminal continuation arrow** — `compute-move-chain-arrows.ts` emits a `terminalGreyContinuation` segment in `#9CA3AF` off the right edge when the active step is the last highlighted link AND the chain has unhighlighted dots remaining, communicating "the chain continues past this view."
- **Portrait drag-to-avatar hover-dwell (landscape parity)** — Long-pressing a card in the portrait workweek view and hovering it over a different tech's avatar in the strip runs the same `useDragToAvatar` hover-dwell pattern landscape uses (200/500/900ms 3-buzz haptic envelope). The single mode-aware difference: at the buzz-2 threshold the dwell callback dispatches through `enterWorkweek(newTechId, name)` (which swaps `workweekTechId`) instead of landscape's `setSelectedTechIds([newTechId])`. The calendar swaps to the destination tech mid-drag while the drag visual stays attached to the user's finger; the drop lands on the new tech's grid and produces a single `reschedule` intent. Replaces the original drop-on-avatar reassign model — see `docs/PLAN-DEVIATIONS.md#2026-05-08-portrait-week-hover-dwell-parity`.

### Files

| File | Purpose |
|------|---------|
| `app/pending-reality/review.tsx` | Adds `makeDevMultiTechCascadeChain` next to the existing `makeDevCascadeChain` and a dev-seed button for the 3-tech 7-step sequence |
| `src/components/calendar/MoveChainChipRow.tsx` | Optional `onSideArrowPress` / `canSideArrowPress` props render flanking chevron arrows on the actively-isolated chip; legacy callers without the wiring fall back to PR-UX-2 chip behavior |
| `src/components/calendar/TechNameFlashOverlay.tsx` | Reanimated 600ms fade-in / hold / fade-out banner. Inner `FlashBanner` is keyed by `flashKey` so each cross-tech mount cleanly replays the envelope |
| `src/components/calendar/use-side-arrow-tech-mount.ts` | Orchestrator hook: subscribes to `chainStepHighlights` + `selectedChainId` from `usePendingRealityStore`, resolves the active step's source-tech via `intent → appointment.technician_id`, calls `enterWorkweek()` + bumps `flashKey` on every change, exposes `advance(direction)` / `canAdvance(direction)` for the host view |
| `src/components/calendar/move-chain-link-advance.ts` | Pure helper computing the next `chainStepHighlights` from a side-arrow press. Wraps at chain boundaries; single-step chains return false from `canAdvance` (degenerate); empty highlights restart at `[0]` |
| `src/components/calendar/move-chain-ghost-tiles.ts` | `useResourcesWithMoveChainGhosts` accepts optional `activeTechId` filter; single-tech chains hit the same code path as a no-op |
| `src/components/calendar/compute-move-chain-arrows.ts` | New `terminalGreyContinuation: boolean` segment field + `maybeBuildTerminalGreyContinuation` helper |
| `src/components/calendar/MoveChainArrowOverlay.tsx` | Renders `terminalGreyContinuation` segments in `#9CA3AF`, non-interactive |
| `src/components/calendar/resource-calendar-workweek-view.tsx` | Passes `activeTechId` into the ghost hook; mounts `useSideArrowTechMount` + `TechNameFlashOverlay`; mounts `useDragToAvatar({ selectedTechIds, setSelectedTechIds })` with the dwell-options form (landscape parity per `2026-05-08-portrait-week-hover-dwell-parity`) — the adapter proxies `setSelectedTechIds([id])` → `onSwitchTech(id, name)`; wraps each `TechAvatarChip` in a `PortraitAvatarHoverTile` that registers its bbox via `measureInWindow` |
| `app/(tabs)/index.tsx` | `<CalendarBindingProvider key="cal-week">` (down from `cal-week-${workweekTechId}`) so the binding provider survives mid-drag tech swaps; the workweek branch's parallel `<RCDragSubscription>` is omitted (the workweek view owns its own subscription) |

The handoff doc told Phase 3 to "reuse landscape's `onDropOnAvatar(techId)` callback" but that callback was retired by `2026-04-22-hover-dwell-avatar-navigator`. The 2026-05-07 work shipped a portrait-only drop-on-avatar composer that didn't reach on-device parity; the 2026-05-08 follow-up retired it in favor of full landscape parity (hover-dwell + auto-swap-calendar + drop-on-grid, dispatched through `enterWorkweek` instead of `setSelectedTechIds`). See `docs/PLAN-DEVIATIONS.md#2026-05-08-portrait-week-hover-dwell-parity`.

## Profile Avatar Editor

In-app avatar editing with gesture-based crop, zoom, and positioning:

- **Circular crop editor** — Full-screen modal with SVG mask overlay, pinch-to-zoom (0.5x–5x), and drag-to-reposition
- **Image picker integration** — Action sheet with "Edit Current Photo", "Choose from Library", and "Take Photo" options via `expo-image-picker`
- **Crop pipeline** — Uses `expo-image-manipulator` to crop the visible circle area and resize to 512×512 PNG
- **Upload** — Sends cropped image as `multipart/form-data` to `PUT /profile/avatar`; updates Zustand auth store so the change reflects immediately across the app
- **Calendar avatars** — Technician avatar images appear in calendar resource columns via `profile_image_url` → `Resource.avatar` mapping

| File | Purpose |
|------|---------|
| `src/components/avatar-editor.tsx` | Gesture-based circular editor (Reanimated + Gesture Handler) |
| `src/hooks/auth/use-upload-avatar.ts` | FormData upload mutation |
| `app/(tabs)/more.tsx` | Profile card tap → action sheet → editor → upload flow |
| `src/utils/resource-calendar-mapping.ts` | Avatar URL construction for calendar columns |

## Deferred Service Pipeline

The app now captures structured technician observations during the pre-service checklist (Step 5) and presents them as actionable deferred work items on the completion screen (Step 8). Key additions:

- **Deferred Item Capture** — When a checklist toggle is flagged as an issue, an inline card captures severity, recommended service, photo, and notes
- **Deferred Services Card** — Post-job summary with "Recommend to Customer" action (triggers push/SMS via backend)
- **Customer Observations** — Customer detail screen shows unresolved deferred items per vehicle
- **Fleet Health Dashboard** — Fleet detail screen expanded with Health tab (aggregate score, threshold alerts) and Discovered Services tab (outreach targets sorted by health)
- **Brand Abstraction** — All hardcoded "MAXI" references centralized in `src/constants/brand.ts`

See `docs/DEVELOPMENT-LOG.md` for full implementation details.

## Fleet Management System

Comprehensive fleet management for franchise owners, with 8 screens and full backend integration.

- **Fleet List** — Company cards showing real dashboard data (vehicle count, overdue, due soon, total spend) via per-company `useFleetDashboard()` hook. Header links to Due Soon, Shuttle Tracker, and Fleet Analytics.
- **Fleet Detail** — 7-tab company view (Health, Overview, Vehicles, Orders, Discovered, Due Soon, Billing) with action bar for Fleet Check, Book Service, and Shuttle access.
  - **Health Tab** — Aggregate health score with threshold alerts, plus a **Deferred Services Breakdown** showing observation types, counts, and estimated revenue opportunity.
  - **Orders Tab** — Full order history for the fleet company using `useFleetOrders` and `OrderCard` component.
  - **Vehicles Tab** — Vehicle list with "Add Vehicle" by ID and "Assign Driver" per vehicle using fleet mutation hooks.
- **Fleet Check** — 30-second vehicle inspection tool. Select a vehicle, tap through 12 checklist items (coolant, air filter, tires, CEL, wipers, etc.), pass or flag each. Flagged items auto-create `DeferredWorkItem` records via the deferred pipeline.
- **Fleet Booking** — 3-step booking wizard: select vehicle, pick services from catalog, confirm with notes. Calls `POST /fleet/companies/:id/bookings` on the backend.
- **Fleet Analytics** — Cross-company dashboard with portfolio overview (8 metric cards), health distribution bar chart, opportunity pipeline with aggregated deferred item costs, and company rankings by spend.
- **Shuttle Tracker** — MAXI Shuttle order list with status filtering and real-time dashboard counters (active, in transit, in service, returning, completed/week).
- **Shuttle Order Detail** — FedEx/Uber-style status timeline with 7-state progression (Created → Assigned → In Transit → In Service → Returning → Completed). Action buttons advance through each transition with optimistic UI updates. GPS coordinates attached to pickup, deliver, return-pickup, and complete actions. Context-aware "Navigate to" button opens Apple Maps/Google Maps for pickup and shop destinations. Cancel available on early states. Full audit trail from status log.

### Fleet Data Layer

| File | Contents |
|------|----------|
| `src/hooks/inventory/use-fleet.ts` | 9 query hooks + 4 mutation hooks (booking, assign vehicle, assign driver, nudge) |
| `src/hooks/use-fleet-due-soon.ts` | Cross-fleet due-soon query + bulk nudge mutation + templates |
| `src/hooks/operations/use-shuttle.ts` | 5 query hooks + 9 mutation hooks (full CRUD + state transitions) |
| `src/api/endpoints.ts` | 16 fleet endpoints + 14 shuttle endpoints |
| `src/types/api.ts` | Fleet, shuttle, and booking interfaces |
| `src/types/fleet.ts` | Fleet due-soon vehicle, segment, nudge payload/response types |
| `src/types/enums.ts` | `ShuttleStatus`, `ShuttlePriority`, `ShopServiceStatus` |
| `src/constants/colors.ts` | Shuttle status/priority color maps, due-soon segment colors and labels |

See `docs/DEVELOPMENT-LOG.md` for full implementation details.

## Bug Reporter

Local-first bug reporting system with passive frustration detection, session recording, and multiple entry points.

- **Floating Bubble** — Draggable 48pt FAB with edge-snapping, frustration pulse nudge, first-time tooltip, and drag-to-dismiss zone (trash icon appears on drag)
- **Screenshot Detection** — Native screenshot listener prompts "Want to report an issue?" with configurable delay to avoid conflicting with iOS screenshot UI
- **Help & Support** — `app/help/` route group: Report a Bug, My Reports (with pending badge), Reporter Settings, Contact Support
- **Report Composer** — Modal form with attachment carousel, screenshot annotation (SVG drawing), voice memo recorder with draft persistence (including duration), category chips, offline banner
- **Deferred Send** — Tapping "Send" saves a draft and starts a background 30-second grace period. Reopening the composer pauses the timer; closing resumes it with the remaining time. Hitting "Send" again resets the timer. After a third "Send" tap, the report submits immediately. A success toast confirms submission when the report is finalized.
- **Session Recording** — Higher-quality disk-based screen capture (8fps JPEG) that starts when the composer opens and continues across open/close cycles. Attached to the report on submission. 300-second hard cap with configurable abandon timers.
- **Frustration Detection** — Passive observation of 6 signal types (rage taps, dead-end scrolling, rapid back-nav, form abandonment, error dwell, repeated actions) with tier-weighted scoring
- **Rolling Buffer** — 3fps screen capture (2fps on low-RAM) into a circular base64 buffer for context on report submission. Pauses automatically when session recording is active.

### Bug Reporter Data Layer

| File | Contents |
|------|----------|
| `src/services/bug-report.service.ts` | Local storage service (submit, draft, history, pending queue) |
| `src/services/frustration-tracker.ts` | Event accumulation, tier scoring, nudge logic |
| `src/hooks/utility/use-bug-report.ts` | 7 TanStack Query hooks (list, detail, submit, frustration batch, known issues, upload URL, sync) |
| `src/hooks/ai/use-frustration-detection.ts` | Context provider + 6 signal detectors |
| `src/hooks/utility/use-rolling-buffer.ts` | View-shot capture provider with device-aware settings |
| `src/hooks/utility/use-session-recording.ts` | Disk-based session capture (start, pause, resume, stop, cancel, stale cleanup) |
| `src/hooks/utility/use-bubble-state.ts` | Zustand store for bubble visibility, position, dismiss tracking (global, reactive) |
| `src/hooks/utility/use-voice-recorder.ts` | expo-av recording lifecycle (start, stop, playback, delete, loadUri for draft restore) |
| `src/hooks/utility/use-screenshot-detection.ts` | expo-screen-capture listener with configurable delay prompt |
| `src/types/bug-report.ts` | All enums, interfaces, and payload types mirroring backend |
| `src/constants/bug-report.ts` | Thresholds, storage keys, role defaults, session recording config |
| `src/components/bug-report-toast.tsx` | Animated success confirmation toast (slide-in, 3s hold, fade-out) |

## Camera Scanner for Start Job

Technicians can scan license plates and VIN labels with the device camera instead of typing manually. The scanner is a full-screen modal launched from the Start Job and Confirm Vehicle screens:

- **Photo capture flow** — Uses `expo-image-picker` camera capture for both VIN and plate paths
- **Backend OCR** — Captured image is uploaded to `POST /jobs/scan-vehicle` for recognition
- **Normalized output** — Scanner sanitizes VIN/plate text before auto-filling fields

Scanned text auto-fills plate or VIN fields, then continues through the existing vehicle decode flow. This flow works in Expo Go and EAS builds.

See `docs/DEVELOPMENT-LOG.md` for full implementation details.

## Biometric Authentication

Opt-in Face ID / Touch ID unlock so returning users can skip typing credentials. Biometric is a client-side convenience lock on top of existing JWT auth — the backend is unaware.

- **Enrollment prompt** — After first password login, an alert offers to enable biometric if the device supports it
- **Biometric lock screen** — On subsequent app launches, the native Face ID / Touch ID prompt fires automatically before granting access to stored tokens (currently commented out for Expo Go compatibility; uncomment in a dev build)
- **Settings toggle** — Face ID / Touch ID can be enabled or disabled at any time from the More tab
- **SecureStore hydration fix** — Added retry logic to handle an Expo Go cold-start race condition where SecureStore returns null on the first read

Requires a development build (`npx expo run:ios`) for Face ID to work — Expo Go's Info.plist lacks `NSFaceIDUsageDescription`.

See `docs/DEVELOPMENT-LOG.md` for full implementation details.

## Daily Briefing

Pre-shift summary screen showing everything a technician needs before starting the day. Accessed via an amber banner CTA at the top of the Calendar tab.

- **Job Summary** — Total jobs, service time, drive time, estimated finish
- **Route Summary** — Stop count, distance, first/last stop times
- **Material Requirements** — Each item shows quantity needed and van stock status (OK / Low / Out). Issue rows are tappable (navigate to inventory), with a "View Inventory" action button when any items need attention
- **Alerts** — Severity-colored alerts for missing inventory, pinned customer notes, weather, and schedule conflicts
- **Start Route** — Fixed CTA to begin the day's route

### Actionable Stock Alerts

All stock warning surfaces are now actionable:

- **Daily Briefing** — Issue material rows navigate to inventory; "View Inventory" button appears when issues exist
- **Route stop badge** — Tapping the stock pill navigates to the pre-job briefing where substitutes and "Pull from HQ" are accessible
- **Route timeline header** — Tapping the stock count scrolls to the first affected stop
- **Substitution sheet** — "No substitutes available" dead end now includes a "View in Inventory" navigation button

Consumes `GET /briefing/:date` from the backend precomputation pipeline.

## Live Job Timer

Enhanced service timer with persistent countdown, global overlay, customer context, and automatic customer notification.

- **Countdown display** — Large timer counts DOWN from scheduled service duration with color-coded status: green "On Track", yellow "Tight", red "Running Late". Falls back to stopwatch (count up) only when no duration is defined
- **Wall-clock persistence** — Timer uses a Zustand store with a `Date.now()` anchor instead of an incremental counter. Survives app backgrounding, screen navigation, and component remounts without drift
- **Global timer bar** — When navigating away from the timer screen, a slim status-colored bar appears at the top of every screen showing the countdown and service name. Tap to return to the timer
- **Customer context card** — Shows customer name, vehicle (year/make/model + plate), and scheduled services at the top of the timer screen
- **Compact leave-by line** — Single-line reminder showing when to leave for the next customer, color-coded by urgency
- **Progress bar** — Visual elapsed-vs-scheduled indicator (hidden in stopwatch mode)
- **Home navigation** — Header home button lets the technician navigate to tabs while the timer continues running
- **+7 minute prompt** — Modal asks "Notify next customer?" when running behind
- **+10 minute auto-notify** — Backend triggers automatic customer notification via push/SMS
- **Backend sync** — Timer state reconciles with server `elapsed_min` on screen re-entry

## Customer Preferences

Read-only preferences section on customer detail screen, showing scheduling, communication, and access preferences set by the customer or dispatcher.

- Preferred time of day, days, communication mode
- Same-technician preference, access instructions
- Per-vehicle parking and orientation notes

## Communication Threads

Enhanced conversation view with internal notes channel and pinned message display.

- **Channel toggle** — Switch between customer-facing messages and internal notes
- **Pinned notes** — Amber-highlighted section showing pinned messages at the top
- **Internal styling** — Yellow/amber bubbles with lock icon, distinct from customer-facing blue bubbles

## AI Message Draft Review

Personalized customer messages drafted by the backend AI service and reviewed/edited/sent by the technician via a single bottom sheet. Replaces the previous placeholder that POSTed straight to a fictional `/messages/send` endpoint.

### Lifecycle

1. **Backend creates a draft** — Either explicitly via `POST /messages/draft` (e.g., when a copilot tool calls "draft a follow-up"), or automatically by an automation rule (running late, oil change due, post-job follow-up). Draft is stored with `intent`, `original_text`, `trigger_reason`, `recipient`, and `status: pending`.
2. **App is notified** — One of three trigger paths fires: a `MESSAGE_DRAFT_READY` push notification with `draft_id`, a copilot suggestion of `type === "draft_message"` for the active appointment, or a direct call to the `triggerDraft(id)` Zustand helper from anywhere in the app.
3. **Sheet opens** — `<DraftTriggerListener />` (mounted at the root layout) renders `<MessageDraftSheet draftId={...} />` which fetches the full draft, shows the recipient + intent badge + trigger banner, and renders the editable message body.
4. **Tech reviews** — Three terminal actions:
   - **Send as-is** → `POST /drafts/:id/send` (no `edited_text`)
   - **Edit + Send** → `POST /drafts/:id/send` with `{ edited_text }` (CG-6 combined call — backend records the edit and sends in one transaction)
   - **Discard** → `POST /drafts/:id/reject` with `{ reason: "user_dismissed" }`
5. **AI feedback is implicit** — The backend computes Levenshtein distance + edit ratio between `original_text` and `edited_text` to learn from the technician's edits. There is no explicit `/ai/feedback` endpoint.

### QuickText Integration

Static QuickText templates (Arriving, On Site, Ahead of Schedule, Job Complete) defer to AI drafts when an active draft exists for a matching intent:

| QuickText template | Maps to AI intent |
|---|---|
| `AHEAD_OF_SCHEDULE` | `running_late` |
| `JOB_COMPLETE` | `follow_up` |

When a matching draft is pending or approved, the QuickText row gets an "AI draft" badge and a sparkle icon; tapping it opens the `MessageDraftSheet` instead of firing the static template send. Templates without a matching draft fall through to the unchanged template behavior.

### Files

| File | Purpose |
|------|---------|
| `src/types/messaging.ts` | `MessageDraft`, `DraftIntent`, `DraftStatus`, `DraftRecipient`, `INTENT_DISPLAY`, request payload types |
| `src/api/endpoints.ts` | `messages.draft.{create, pending, list, detail, edit, approve, send, reject, editPatterns}` |
| `src/hooks/ai/use-message-draft.ts` | Read/write hooks + `useMessageDraft(draftId)` orchestrator that owns the local edit buffer and exposes `{ draft, isLoading, editedText, setEditedText, isEdited, edit, send, sendEdited, discard }` |
| `src/components/ai/message-draft-sheet.tsx` | Bottom sheet driven by `draft_id` only — pulls everything else from the hook |
| `src/components/ai/draft-trigger-listener.tsx` | Global listener — subscribes to the trigger store and (optionally) per-appointment copilot suggestions |
| `src/stores/draft-trigger.ts` | Zustand store with `pendingDraftId` + `triggerDraft(id)` imperative helper for non-React callers |
| `src/notifications/handlers.ts` | Routes `MESSAGE_DRAFT_READY` push payloads to `triggerDraft(draft_id)` |
| `src/components/calendar/quicktext-sheet.tsx` | Defers to AI drafts when intents match |

See `docs/implementation-plans/ai-message-draft-contract.md` for the full backend contract and CG-1..CG-6 changes.

## Exception Alert Badges

Job cards throughout the app can now display severity-colored alert dots when appointments have operational exceptions.

- **Color-coded dots** — Blue (info), orange (warning), red (critical) next to the appointment time
- **Tap to expand** — Shows the alert detail text in a bordered card
- Example: "Customer requested morning only — this slot is at 2:15 PM"

## Haptic Feedback

Integrated `expo-haptics` across key touchpoints for tactile feedback:

- **Light** — Tab presses, banner taps, navigation
- **Medium** — Camera scan open, service start, job start
- **Heavy** — Start Route (significant action commitment)
- **Success** — Service completion
- **Warning** — Customer notification sent
- **Selection** — Service toggle in grid

See `docs/DEVELOPMENT-LOG.md` for full implementation details.

## Franchise Route Map

The franchise owner's multi-technician route map keeps all route overlays mounted at all times and toggles visibility via props (opacity, stroke color) rather than mounting/unmounting native views. This prevents partial renders and crashes when switching between "Show All" and individual technician routes. The "Show All" button re-fits the camera to all coordinates after restoring visibility.

## Drag Reschedule Sheet (Chip-Bar Mini-Rescheduler)

`<DragRescheduleSheet>` (`src/components/route/drag-reschedule-sheet.tsx`) is the dual-mode mini-rescheduler that will open when the user drags a chip on the franchise route map's chip bar. Two modes share one component:

- **insert** — single picker. Window = `[leftNeighbor.end_time, rightNeighbor.start_time]`. Default = midpoint snapped to 15 min.
- **swap** — two pickers side-by-side. Each side defaults to the OTHER side's pre-swap `scheduled_time`, so hitting Save immediately reproduces today's auto-trade.

Per-side window clamping disables step arrows at boundaries, end times are derived as `start + durationMinutes` (never picked, preserves duration), and a single Notify-customer toggle fans out to both sides on swap. Cross-midnight windows render an error state with only Cancel + Advanced visible. Built on `<MapActionModal>` (not gorhom `<AppSheet>`) for the same gorhom-around-MapView reasons as `<QuickTimeSheet>`.

**Wired surfaces:**
- **swap** mode (Phase 4, 2026-05-21) — drag chip A onto chip B's snap zone → mini-sheet opens → Save fires `PATCH /api/v1/franchise/routes/:routeId/stops/swap` with the dispatcher's picked times (`aNewTime` / `bNewTime` / `notifyCustomer`). Per-side windows + defaults + durations derived by `computeSwapWindows` in `src/utils/route-reschedule-windows.ts`.
- **insert** mode (Phase 6, 2026-05-22) — drag chip A between two other chips (or off the front / back of the bar) → mini-sheet opens with a single picker → Save fires `PATCH /api/v1/franchise/routes/:routeId/stops/:stopId/reposition` via `useRouteStopReposition` (`src/hooks/route-map/use-route-stop-reposition.ts`), atomically updating the target's `scheduled_time` + `stop_order` and shifting affected neighbors. Window + duration + 1-indexed `newStopOrder` derived by `computeInsertWindow` in the same helper file (24 tests total across SWAP + INSERT). Off-end drops fall back to `DISPATCH_DAY_START_HHMM` / `DISPATCH_DAY_END_HHMM` for the missing neighbor's bound. Phase 7b (2026-05-22) added the worklet-side `classifySnapZone` helper (`src/utils/chip-bar-snap-zone.ts`) that emits the off-end `landingSlot` plus 22 unit tests; the off-end window math was already in place pre-7b, so 7b is coverage + refactor, not new behavior.

Both wirings share a single discriminated-union `dragRescheduleState` in `franchise-route-map.tsx` and a single `<DragRescheduleSheet>` mount that branches internally on `mode.kind`. Both mutations do optimistic cache patches that mirror the BE write (positions + times) so the chip bar + polyline redraw on the next frame.

**Chip-bar model (Phase 7a, 2026-05-22):** the chip bar is presentational again. The bottom-bar Commit/Discard buttons + parent-owned `chipBarPending` / `chipBarCommitting` batch-commit machinery from r16.1 are retired — every drag commits immediately via its mini-sheet's Save, so there's no batch to commit or discard. `pendingOrder` on `<RouteReorderChipBar>` derives directly from `liveMenuRoute.stops` (cache-backed, kept current by the swap / reposition mutations' optimistic patches). The chip-bar's `onReorder` prop stays as a legacy fallback for non-route-map consumers; in production it's a no-op since the route-map wiring always supplies both snap-zone handlers.

**Sheet layout (2026-05-22 follow-up):** `<DragRescheduleSheet>` now structures its panel as `header → ScrollView(body + notify) → pinned action row`. The action row sits OUTSIDE the scroll with a hairline top border so Cancel/Save are always reachable regardless of device size or mode (insert vs swap). Fixes a landscape-iPhone bug where the Save button was clipped in SWAP mode and the action row floated mid-picker in INSERT mode.

**Plan mode (B2, shipped — 2026-05-22; B2-1 through B2-7 complete):** opt-in "Plan / Planning" pill that sits on the white chip-bar next to the Tech button, styled identically. Switches the bar into a deferred-commit mode where drops queue pending moves, the polyline morphs in real time (B2-3), and a "Review & commit" sheet (`<ReviewPlanSheet>`, `src/components/route/review-plan-sheet.tsx`) batches everything. When `plannedMoves.length > 0` the "Plan" pill morphs **in place** into a green `"{N} · Review"` CTA (B2-4) that opens the sheet — one pill, two states, same screen position. The sheet renders per-row time pickers + per-row Remove buttons + a single Notify-customers footer toggle; editing a time round-trips through the parent's `plannedMoves` so the polyline + chip bar morph in real time as you edit. Commit (B2-5) drives a sequential mutation pipeline via the pure `commitPlanSequentially` helper (`src/utils/route-plan-commit.ts`) — each planned move fires through the existing `swapMutation` / `repositionMutation` with the shared Notify flag, per-row badges in the sheet flip idle → in-flight → committed (green) or failed (red, with the BE error message), the pipeline stops on first failure leaving the failed row editable for retry, succeeded moves get pruned from the plan, and on full success the sheet closes + plan mode exits automatically. B2-6 (2026-05-22) adds a "Discard plan" link to the sheet header (red text + trash-outline icon, right of the subtitle) — tap it to fire an `Alert.alert` confirm; on Discard the plan clears, plan mode exits, and the sheet closes in one action. Link is hidden when there's nothing to discard (`rows.length === 0`) or a commit is mid-flight (`isSubmitting === true`, so committed mutations don't get orphaned). The three other B2-6 sub-items (window-changed-mid-edit detection, navigation-away `beforeRemove` guard, plan-mode toggle disabled during commit) are explicitly deferred — see the plan doc for rationale. **B2-7 (2026-05-22) — per-side duration stepper.** A horizontal chevron stepper sits directly under the "Window" hint on each side of `<DragRescheduleSheet>` (insert + swap) and every row of `<ReviewPlanSheet>`. Dispatchers can extend or shorten the appointment in 15-minute increments (`DURATION_MIN_MINUTES = 15`, `DURATION_MAX_MINUTES = 480`). Overrides flow through the existing swap / reposition mutations via new optional `aNewDurationMin` / `bNewDurationMin` / `newDurationMin` payload fields (BE accepts these as of REMIBackend PR #103). End-time math and the polyline morph automatically because `applyPlannedMoves` uses `override ?? base` for end-time computation. Setting the override back to the base unsets it (`undefined`), so the wire payload stays byte-identical to pre-B2-7 for any move where the dispatcher didn't actually change the duration. Plan: `docs/implementation-plans/chip-bar-plan-mode-batch.md`.

## Route Reoptimization After Reschedule

When a technician drag-to-reschedules an appointment on the Today or Week calendar tab, the app automatically triggers route reoptimization so the Route tab reflects the updated stop order.

- **Flow:** Reschedule mutation succeeds → `POST /routes/optimize` fires → route query keys invalidated → Route tab refetches with new stop order
- **Best-effort:** If optimization fails (Google Cloud API unavailable, no route for today), the error is caught silently and the calendar reschedule still succeeds. The backend has a local fallback that sorts stops by `scheduled_time` when the external API is down.
- **Cache invalidation:** `useTechnicianRescheduleAppointment` invalidates `["calendar", "day"]`, `["calendar", "week"]`, and `["routes"]` query keys on settlement

## Franchise Inventory

All 6 inventory screens are role-aware. Franchise owners see aggregated inventory across all technician vans; technicians see only their own van.

- **Dashboard** — `SectionList` grouped by technician/van with an aggregate summary bar
- **Par Alerts** — Cross-van alerts with location names
- **Waste Tracking** — All vans' containers with technician identification
- **Stock Adjustment** — Location picker step before item selection
- **Transfer** — Source van selector, destination location picker, then item picker
- **History** — All-location entries with technician/location attribution

Stock levels are computed from the inventory history ledger (summing `quantity_change` per item per location). Waste data is fetched per-location in parallel.

## Fluid Level Documentation

New job flow step (step 8 of 10) for recording fluid levels during each service visit.

- **6 fluid types** — Coolant, washer, brake, transmission, power steering, differential
- **Per-fluid inputs** — Measured level text field + action dropdown (Normal, Topped off, Low, Dirty)
- **Delta from last visit** — Previous action shown inline for each fluid type
- **Color-coded gauge icons** — Green (normal), yellow (topped off), red (low/dirty)
- **Skippable** — Navigates directly to debrief if no levels entered

Consumes `POST /jobs/:id/fluids` and `GET /vehicles/:vehicleId/fluid-history`.

## Per-Tire Tread Depth Input

Enhanced pre-service checklist with a 4-tire visual diagram for recording tread depth.

- **4-tire layout** — Left Front, Right Front, Left Rear, Right Rear arranged in a car body diagram
- **Numeric inputs** — Depth in mm with decimal pad keyboard
- **Color-coded zones** — Green (4mm+ safe), yellow (2-4mm monitor), red (<2mm replace)
- **Delta from last visit** — Shows change per tire from previous service

Submits tread data via `POST /jobs/:id/tread` alongside the checklist.

## Voice Debrief

New job flow step (step 9 of 10) for capturing customer observations via text (voice recording in dev builds).

- **AI-parsed preview** — Backend categorizes free-text into profile fields (pets, family, work, etc.) with confidence scores
- **Category cards** — Each parsed field shown with icon, value, and confidence percentage
- **Unclassified items** — Flagged for admin review
- **Skip button** — Always available, not mandatory

Consumes `POST /jobs/:id/debrief`.

## OEM Recommendation Badges

Carfax OEM manufacturer recommendations displayed on customer detail screen.

- **Pulsing animation** — Overdue items pulse red to draw attention
- **Due status** — Color-coded: green (on track), orange (coming soon), red (due now)
- **Expandable details** — Interval, next due date, last inspection result
- **Log Inspection** — One-tap to record "checked OK" or "replaced" during active jobs

Consumes `GET /vehicles/:vehicleId/recommendations` and `PUT /jobs/:id/recommendations/:recId`.

## MAXI University Training

University-structured training system replacing the flat module list.

- **School browser** — Grid of training divisions (Oil Change, Tire, Fleet Ops, etc.) with completion percentages
- **Course list** — Progress bars and module counts per course
- **Module progression** — Sequential unlock (previous module must be complete)
- **Lesson viewer** — Content links (video/diagram/SOP) with inline quiz
- **Quiz** — Multiple-choice questions with immediate grading and pass/fail result
- **Certification dashboard** — 5-level progression (Rookie → Trainer) with journey timeline and next-level requirements
- **Video submissions** — Upload task verification videos, view review status (pending/approved/redo)

Consumes training school/course/module/lesson/quiz/certification endpoints.

## Customer List with Filters

The Customers tab now loads a full browsable customer list on mount with Square-style filtering.

- **Filter bottom sheet** — 6 filter categories with collapsible rows and chip selection
  - Last Visited (This week / This month / This quarter)
  - Hasn't Visited (30+ / 60+ / 90+ days)
  - Visit Frequency (First-time / Repeat / Loyal)
  - Vehicle Make (dynamic from loaded data)
  - Has Deferred Work (Yes / No)
  - Creation Source (Walk-in / Booked / Referral)
- **Active filter chips** — Removable pills below the search bar showing current filters
- **Richer list cards** — Vehicle makes, visit count, last visit date, deferred work badge
- **Search override** — Typing 2+ characters switches to server-side search; clearing returns to filtered list
- **Client-side filtering** — All filters apply in-memory on the loaded list for instant results

Consumes `GET /customers/list` from the backend. Tapping "Start Job" on a customer card fetches the full customer detail, pre-fills the job flow store with customer and vehicle data, and navigates directly to the confirm-vehicle screen.

## Vehicle Picker & Add New Vehicle

When starting a job from a customer with multiple vehicles, the confirm-vehicle screen displays a Garage-style vehicle picker.

- **Vehicle cards** — Selectable cards showing Year Make Model, plate, color, mileage. Blue highlight + checkmark on the selected vehicle
- **"+ Add New Vehicle" card** — Dashed-border action card that switches to new vehicle entry mode
- **Scan VIN or Plate** — Opens the camera scanner modal (same `VehicleScanner` from Start Job) for barcode/OCR recognition
- **Manual VIN lookup** — Type a VIN and tap decode to auto-fill Year/Make/Model/Engine
- **Manual entry** — Year, Make, Model, Engine form fields with placeholder hints

Tapping an existing vehicle card exits new-vehicle mode and re-selects it. Single-vehicle customers skip the picker entirely.

## Error Handling

All job flow screens surface real API errors via `Alert.alert()` using a centralized `extractErrorMessage()` utility (`src/api/errors.ts`). No silent fallbacks — every API failure is visible to the technician with the backend's error message.

## Getting Started

### Prerequisites

- Node.js 18+
- Xcode with iOS Simulator (for iOS development)
- REMI Backend running on `http://localhost:3000`

### Install and Run

```bash
npm install
CI=0 npx expo start
```

Press `i` to open in iOS Simulator, or scan the QR code with Expo Go on a physical device.

### iOS Simulator (Manual)

If Expo Go needs to be installed manually on the simulator:

```bash
# Boot a simulator
xcrun simctl boot "iPhone 16 Pro"

# Download and install Expo Go 54.0.6
curl -L "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-54.0.6/Expo-Go-54.0.6.tar.gz" -o /tmp/ExpoGo.tar.gz
mkdir -p "/tmp/ExpoGoApp/Expo Go.app"
cd "/tmp/ExpoGoApp/Expo Go.app" && tar -xzf /tmp/ExpoGo.tar.gz
xcrun simctl install booted "/tmp/ExpoGoApp/Expo Go.app"

# Start Metro and open in simulator
CI=0 npx expo start
xcrun simctl openurl booted exp://localhost:8081
```

### Backend

The app expects the REMI Backend API at `http://localhost:3000/api/v1/technician/`. See `src/constants/config.ts` to change the base URL.

**Note:** The backend must have all 7 calendar migrations applied (`20260409000001` through `20260409000007`). Run `npm run migrate` in REMIBackend if the calendar shows empty grids or returns 500 errors.

### Profit Model — Save / Load / Share (PM-6)

The Profit Calculator persists scenarios two ways:

- **Authenticated technicians and franchise owners** save to `/api/v1/tools/profit-model/sessions/auth` (POST to create, PUT to update) and load from `My Scenarios` (a pageSheet listing the user's saved sessions, with name, last-updated, and locally-computed payback at-a-glance). Loading a scenario hydrates the calculator and remembers the source session so the next Save updates in place.
- **Unauthenticated users** keep the existing on-device autosave (`expo-secure-store`, debounced 500 ms) and additionally get a **Save to permanent link** button that POSTs an anonymous session and returns a 90-day share URL. The URL surfaces in a sheet with one-tap copy (`expo-clipboard`) and a native Share button.

**Deep link:** `remi://profit-model/share/:token` opens `app/(public)/profit-model/share/[token].tsx`, which fetches the session by token (no auth required — the token is the credential), stashes it in `useProfitModelDraftStore` (renamed from `useProfitModelPending` in P0-FE-4 to avoid cognitive collision with the new scheduling-intent `usePendingRealityStore`), and `router.replace()`s to the calculator. The calculator's mount effect consumes the pending session once and applies its inputs.

**API access:** `src/api/profit-model.ts` exposes `createAnonymousSession`, `createAuthenticatedSession`, `getSession`, `listMySessions`, `updateSession`, and `deleteSession`. All five go through `toolsApi()` in `src/api/client.ts`, which mirrors the technician client's 401-refresh logic but never force-logs-out when no refresh token is present (so anonymous endpoints work pre-auth). TanStack Query layer lives in `src/hooks/profit-calculator/use-profit-sessions.ts`.

**Stretch (P3) — Pre-fill from real franchise data:** Tracked as a TODO in `app/(public)/profit-calculator.tsx`. Requires a new backend endpoint (`GET /api/v1/tools/profit-model/prefill-from-franchise`) that synthesizes a `ProfitModelInputs` from the franchise's last 12 months of P&L. Filed as a follow-up so PM-6 isn't blocked on backend work that wasn't part of the original spec.

### Profit Model Engine Sync

The `vendor/profit-model/` directory contains a vendored copy of the Profit Model v2 engine from `REMIBackend/src/shared/profit-model`. The engine is pure TypeScript with no Node-only APIs and is consumed via the `@profit-model/*` tsconfig path alias.

**Do not edit files in `vendor/profit-model/` directly.** To pull engine updates from REMIBackend, run:

```bash
npm run sync:profit-model
```

The vendored files are committed to git so iOS/Android builds work without REMIBackend present. See `/Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md` §2 for the architecture rationale.

## Navigation

| Tab | Screen | Purpose |
|-----|--------|---------|
| Calendar | Day / Week / Month + Route | **Calendar V2** — `react-native-resource-calendar` for both roles. Franchise owners: multi-resource columns (one per technician), drag-to-move rescheduling, pinch-to-resize, viewfinder pinch-to-zoom (dynamic columns + hour scaling, 5 AM–6 PM range), small-event UX (min 22px height, hitSlop, duration-preserving drag), slot-type-colored event blocks with alert badges, 8 bottom sheets (detail, form, reschedule, cancel, QuickText, AI scheduling, Flex List, personal events), Mon–Thu workweek per-tech view, month view with capacity indicators. Technicians: Route/Today/Week toggle with single-column day view, Mon–Thu workweek grid, drag-to-reschedule on both views with auto route reoptimization, pinch-to-zoom hour height on the day view (parity with the franchise-owner view), tap-to-navigate to order detail. |
| Start Job | Plate/VIN entry + camera scan | Initiates 10-step job execution flow; scan button opens camera for barcode/OCR recognition |
| Orders | Order Manager | Searchable order ledger with enriched cards, server-side search, 6-category filter sheet, swipe actions, bulk select + export, fleet manager with real dashboard data |
| Customers | Browse + filter + search | Full customer list with Square-style filters, search, quick-add |
| More | Profile + tools | Messages, inventory, Shield, training, referrals, logout |

## Auth Flow

1. User enters email + password on login screen
2. Backend returns JWT access token (15min) + refresh token (30 days)
3. Tokens stored in expo-secure-store, hydrated into Zustand on app start
4. API client interceptor attaches Bearer token to all requests
5. On 401, interceptor attempts token refresh, retries original request
6. On refresh failure, user is logged out and redirected to login
7. **Biometric unlock (opt-in):** If enabled, app launch gates token hydration behind a Face ID / Touch ID scan. On success, tokens are activated and the user proceeds. On failure, falls back to the password form

## Status Color System

| Status | Color | Hex |
|--------|-------|-----|
| Finalized | Green | #22C55E |
| In Progress | Blue | #3B82F6 |
| Payment Due | Red | #EF4444 |
| Scheduled | Yellow | #EAB308 |
| Cancelled | Grey | #6B7280 |

## Order Manager

The Orders tab is a full transaction ledger with DropTop-inspired UI:

- **Enriched order cards** show order ID, date/time, customer, vehicle + license plate badge, mileage, services, total amount, pay status badge, and fleet company tag
- **Server-side search** (`GET /orders/search?q=`) matches order ID, customer name, license plate, phone, email
- **6-category filter sheet** — Status, Pay Status, Date Range, Vehicle Make, Fleet Company, Has Notes
- **Swipe actions** — Left: Receipt, Send (email/SMS), Carfax; Right: Edit, Collect, Add Note
- **Order notes** — "Add Note" swipe action opens a bottom sheet with text input and saves via `POST /jobs/:id/notes`
- **Bulk mode** — Long-press to enter, checkboxes on each card, bottom toolbar with:
  - Row 1: CSV export, PDF export, Mark Paid
  - Row 2: Send Invoice (bulk email), Carfax Re-send (bulk report), Tag for Review
- **Fleet Manager** tab shows real dashboard data per company via `useFleetDashboard()` hook; tapping a company navigates to the fleet detail screen

Key files: `src/components/order/order-card.tsx`, `src/components/order/order-filter-sheet.tsx`, `src/components/order/order-note-sheet.tsx`, `src/hooks/orders/use-order-export.ts`, `src/components/shared/swipeable-row.tsx`, `src/components/shared/bulk-action-bar.tsx`

### Swipe Actions (Plan Item 16.01)

Order and job cards support swipe gestures via the reusable `SwipeableRow` wrapper (uses `react-native-gesture-handler` Swipeable). Swipe left reveals quick actions (call customer, start navigation, mark complete); swipe right reveals secondary actions (reschedule, add note). Action background colors use the status color system from `src/constants/colors.ts`. Swipe is automatically disabled when bulk selection mode is active.

### Multi-Select Bulk Operations (Plan Item 16.02)

Long-pressing any order card enters bulk selection mode. All cards display checkboxes; a bottom `BulkActionBar` shows the selected count, total amount, and action buttons: Reassign, Reschedule, CSV export, Notify, Mark Paid, and Review. A "Done" button exits selection mode. Both `SwipeableRow` and `BulkActionBar` are reusable shared components.

## Fleet Due-Soon Nudges

### Cross-Fleet Due-Soon Screen

A dedicated `app/fleet/due-soon.tsx` screen aggregates due-soon vehicles across all fleet companies. Accessible from a header bell icon on the Fleet Manager list.

- **Three collapsible sections** — Overdue (red), Due in 7 Days (yellow), Due in 14 Days (blue) with count badges and color-coded left borders
- **Per-vehicle rows** — License plate, year/make/model, driver name + phone, fleet company name, service type due, estimated due date/mileage, last service date + mileage, urgency label
- **Bulk select** — Checkbox per row, "Select All" per section, header Clear button, selected count badge
- **Bottom action bar** — Appears when items selected; "Send Nudge" opens the template picker
- **Summary bar** — Color-coded segment counts with total at top of screen
- **Pull-to-refresh** and skeleton loading state
- Hook: `useAllFleetDueSoon()` calling `GET /franchise/fleet/due-soon` (mock data until backend BE-11 lands)

### Nudge Template Picker

Full-featured bottom sheet (`src/components/fleet/nudge-template-picker.tsx`) for composing and sending proactive outreach:

- **3 pre-built templates** — "Due Soon — Pick a Time", "Overdue — Quick Check", "We'll Be Onsite" with `{{driver_name}}`, `{{vehicle}}`, `{{service_type}}`, `{{due_date}}` variable interpolation
- **Custom message** — Freeform input with 320-char limit and variable placeholders
- **Live preview** — Shows interpolated message for the first selected vehicle
- **4 channels** — SMS, Email, Call List (CSV download), Schedule Block (date picker for bulk booking)
- **Smart targeting** — Radio toggle between "Fleet Coordinator" (single contact per company) and "Individual Drivers" (message each driver)
- Nudge sends via `POST /franchise/fleet/nudge` (mock until backend BE-11)

### Per-Company Due-Soon (existing)

The fleet detail screen's Due Soon tab uses the per-company `useFleetDueSoon(companyId)` hook with the existing `NudgeActionSheet`.

### Fleet Due-Soon Data Layer

| File | Contents |
|------|----------|
| `src/types/fleet.ts` | `FleetDueSoonVehicle`, `DueSoonSegment`, `FleetDueSoonResponse`, `NudgeTemplate`, `NudgeChannel`, `NudgeTargetType`, `NudgeSendPayload`, `NudgeSendResponse` |
| `src/hooks/use-fleet-due-soon.ts` | `useAllFleetDueSoon` query, `useFleetNudge` mutation, `NUDGE_TEMPLATES`, `interpolateTemplate()` |
| `src/components/fleet/due-soon-vehicle-row.tsx` | Memoized vehicle row with checkbox, urgency border, detail grid |
| `src/components/fleet/nudge-template-picker.tsx` | Bottom sheet with template selection, preview, channel, targeting, send |
| `src/constants/colors.ts` | `DueSoonSegmentColors`, `DueSoonSegmentBgColors`, `DueSoonSegmentLabels` |
| `src/api/endpoints.ts` | `fleet.dueSoonAll`, `fleet.nudgeBulk` endpoints |

## Unified Customer + Vehicle Search (Plan Item 14.04)

Single search bar queries both customer data (name, phone, email) and vehicle data (plate, VIN, make/model) simultaneously. Results are grouped by customer with matched vehicles listed below each entry.

- **Dual-endpoint search** — `useUnifiedSearch` hook queries `/customers/search` and `/vehicles/search` in parallel using `Promise.allSettled`
- **Grouped results** — Customers matched via name/phone show with their vehicles; vehicles matched via plate/VIN show their owner as the parent card
- **Match source indicators** — "Matched by vehicle" badge when a result came from the vehicle endpoint; "Customer & vehicle match" when both endpoints matched
- **License plate highlighting** — Plates matching the search query are highlighted with amber background
- **Start Job integration** — Each result includes a Start Job button for quick job initiation
- **Demo fallback** — Client-side vehicle filtering with demo data when the backend vehicle search endpoint is unavailable

Key files: `src/hooks/customers/use-unified-search.ts`, `src/components/customer/customer-card.tsx`, `app/(tabs)/customers.tsx`

## Leave-By Countdown

During active service, the timer screen shows a compact leave-by line below the main countdown:

- **Green** — "Leave in X min for [Name] · Y min drive"
- **Amber** — Warning when less than 10 minutes remain
- **Red** — "Behind schedule — leave now for [Name]"
- Data from `GET /jobs/:id/timer/leave-by`, polled every 30 seconds (demo fallback when endpoint unavailable)

Key files: `app/job/[id]/timer.tsx`, `src/hooks/jobs/use-job-timer.ts`

## Dispatcher View Enhancements

The franchise owner calendar overview bar now expands on tap to reveal:

- **Technician metrics** — Horizontal scroll of per-tech cards showing completion progress, idle time, behind-schedule risk (color-coded dot: green/yellow/amber/red), and next stop
- **Exception alerts** — Severity-sorted list (critical/warning/info) for deadhead time, unfamiliar accounts, missing inventory, and lateness risk
- **Alert badge** — Badge count on the collapsed bar shows total exceptions (red for critical, amber for warnings)

Key files: `src/components/calendar/calendar-overview-bar.tsx`, `src/hooks/operations/use-franchise-calendar.ts`

## Settings Screen

Accessible from More > Settings:

- **Notifications** — Toggles for job reminders, schedule changes, fleet alerts, message notifications
- **Sounds** — Toggles for notification sound and haptic feedback
- **Calendar Display Hours** — User-configurable Day Starts / Day Ends bounds (default 5:00 AM – 6:00 PM, settable in 30-min steps). Applies to franchise day/week views and the technician's own day view. Per-device, persisted in `useCalendarStore`. Paired with a **Fit to events** toggle (default ON) that controls how the bounds are interpreted:
  - **Fit to events ON** — Calendar caps to the actual span of today's events (snapped to 30-min boundaries). Falls back to the saved bounds on empty days. Reshapes automatically when events are added, moved, or removed. Adjusting the Day Starts / Day Ends steppers automatically flips this OFF (since you're saying "I want these bounds to take effect").
  - **Fit to events OFF (Strict mode)** — The saved bounds win. Events that start before Day Starts or end after Day Ends are hidden or clipped at the edge of the grid. Switching into this mode shows a confirmation Alert + a persistent amber warning banner so the trade-off stays visible.
  Also reachable via the gear icon (`tune`) on each calendar toolbar — opens an inline Quick Settings sheet with the same controls, plus a "More in Settings →" link back to this screen
- **Shift / Availability** — Editable start/end times via 30-minute chevron stepper (12-hour display, persisted as 24-hour `HH:MM`), plus working day toggles (Sun-Sat). Defines the technician's actual schedulable hours (distinct from Calendar Display Hours, which is purely cosmetic)
- **Default Zone** — Read-only display of assigned zone
- Settings persist via `PUT /settings` API; calendar display hours persist locally in AsyncStorage

Key files: `app/settings.tsx`, `src/hooks/auth/use-settings.ts`, `src/stores/calendar.ts`, `src/utils/resource-calendar-mapping.ts`

## White-Label Theme Support

On app launch, the franchise theme is fetched from `GET /franchise/:id/theme` and stored in a Zustand store. All components that reference brand colors (tab bar, headers, accent colors) pull from the resolved theme. Franchise admins get a live-preview editor in Settings.

- **Theme store** — `src/stores/theme.ts` with default MAXI colors, AsyncStorage persistence, preview mode (start/update/commit/cancel)
- **Theme sync** — `useThemeSync()` in providers fetches theme on auth, hydrates from cache on cold start
- **Tab bar integration** — Tab active/inactive colors, header background, and header text all read from the resolved theme
- **Live preview** — Franchise owners see a "Brand Theme" section in Settings with hex color pickers for Primary, Header Background, and Accent. Changes apply instantly across the app. Save commits to store; Cancel reverts
- **Reset to default** — One-tap reset to the REMI default blue palette
- **Demo fallback** — MAXI default theme returned when the backend endpoint doesn't exist yet

Key files: `src/stores/theme.ts`, `src/hooks/auth/use-theme.ts`, `app/settings.tsx`, `app/(tabs)/_layout.tsx`

## Sound Design System

Custom sounds for 5 key events with per-event on/off toggles in Settings. Uses Expo Audio API with preloaded sound assets.

- **Events:** New Job, Job Complete, Rating Received, Message Received, Milestone Unlocked
- **Master toggle** — Disable all sounds at once
- **Per-event toggles** — Each event can be individually enabled/disabled with a preview play button
- **Preloaded assets** — Sounds are loaded once on app mount via `useSoundSystem()` for instant playback
- **Imperative play** — `playSoundOnce()` for use outside React components (notification handlers)
- **Integration points:** Job completion screen (job_complete), dispatch offer modal (new_job), push notification handler (message_received, rating_received, milestone_unlocked)
- **Preferences persist** in AsyncStorage via the sound store

Key files: `src/stores/sound.ts`, `src/hooks/utility/use-sound.ts`, `src/hooks/utility/use-sound-context.tsx`, `src/constants/sounds.ts`, `assets/sounds/`

## Backend APIs

The app consumes two sets of backend endpoints plus a WebSocket connection:

- **Technician API** (`/api/v1/technician/`) — Jobs, schedule, routes, location, dispatch, inventory, auth, referrals, training (university schools/courses/modules/lessons/quizzes/certification/video), deferred work items, daily briefing, job timer (status, leave-by countdown, lateness check), customer preferences, fluid tracking, tread tracking, voice debrief, OEM recommendations, customer list, order search, order export (CSV/PDF), send receipt, report carfax, bulk mark paid, tag for review, order notes, settings (get/update)
- **Franchise API** (`/api/v1/franchise/`) — Calendar, dispatch map, dispatch alerts, tech metrics, inventory management, fleet (health, deferred summary, outreach targets, fleet-scoped orders, booking, batch booking, vehicle/driver assignment, nudge), shuttle (14 endpoints: CRUD, state transitions, dashboard, status log), Shield QA, training admin, referrals, partners, order search, order export (CSV/PDF), bulk mark paid
- **WebSocket** (`ws://{host}:{port}/ws`) — Real-time technician location updates for the franchise owner map. Authenticates with JWT, subscribes to `franchise:{id}` channels. The WebSocket URL is derived from the REST API base URL in `src/constants/config.ts`.

See `src/api/endpoints.ts` for the complete endpoint map and `src/api/client.ts` for the API clients.

## Demo Mode

The app includes demo-specific code for quick testing:

- **Quick Login buttons** on the login screen — one-tap fill for Technician or Franchise Owner demo credentials
- **Reset Demo Data** button in the More tab — wipes and re-seeds all demo data
- **Demo Mode panel** in the More tab (FO-only, D2P-FE-14) — sibling "Reset Demo Data (with conflict scenarios)" + "Run AI scan now" buttons, dual-device demo mode picker (with inline help + APNs registration check for mode (d)), dev-shortcut visibility toggle, and linter strictness picker (Strict — hard conflicts only / Loose — warnings included). State backed by `useDemoSettingsStore` (AsyncStorage)
- **Demo fallback data** in 15 hook files — when backend endpoints don't exist yet, hooks return tagged demo constants (conversations, messages, templates, settings, leave-by timer, dispatcher alerts, technician metrics, order mutations, fleet nudges, fleet due-soon vehicles, quicktext, performance dashboard, stock check warnings). Mutations simulate success responses and optionally update the TanStack Query cache for optimistic UI
- Backend auto-reseeds daily on startup so "today" always has a full active schedule

All demo code is tagged with `@demo-start` / `@demo-end` markers for easy removal (134 total tags across 19 files). See `DEMO-CODE.md` for the full manifest.

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Technician | `tech1@remi-demo.com` | `password123` |
| Franchise Owner | `owner@remi-demo.com` | `password123` |

## Linter parity

The reorganization logistics linter ships in two repos:

- `src/utils/logistics-linter.ts` (this repo — the FE pre-flight engine that powers the review HUD before a commit goes out)
- `/Users/jacegalloway/Documents/codebases/REMIBackend/src/services/scheduling/logistics-linter.ts` (canonical — the BE re-runs the same engine at commit time as the authoritative gate)

These two files MUST stay byte-identical modulo (a) the file-header docstring (the BE carries a `PLAN-DEVIATION:` block this repo does not) and (b) the relative import path (`../types/...` vs `../../types/...`). Any change to the rule body MUST land paired with the same change to the other repo in the same review cycle. CI enforces this on every PR via `scripts/check-linter-parity.sh` (R-CI-1, owned by the BE repo) — see `.github/workflows/ci.yml` job `linter-parity`. Run locally from the BE checkout with `bash scripts/check-linter-parity.sh` (assumes both repos are siblings on disk).

## Documentation

See `docs/` for the full specification documents that govern this project:

- **REMI-UI-Design-Brief.md** — Screen inventories, flow diagrams, design principles
- **REMI-Feature-Spec.md** — Feature detail for every module and interaction
- **REMI-Production-Plan.md** — Architecture decisions, phased build plan
- **DEVELOPMENT-LOG.md** — Ongoing build log with decisions and progress
- **REMI-Calendar-Bug-Runbook.md** — Calendar bug triage, fix log, test scenarios, and logging reference
- **REMI-Calendar-Roadmap.md** — Calendar feature roadmap (Phase 1 complete, Phase 2+ proposals)
- **DEMO-CODE.md** — Manifest of all demo-tagged code and removal instructions
