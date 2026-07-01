# Demo Code Manifest

All demo-specific code is tagged for easy discovery and automated removal.

## Demo mode default — **OFF** (2026-05-08)

The FE-side demo gate lives at `Config.DEMO_MODE` in `src/constants/config.ts` and is defaulted to `false`. Today the only consumer is `useAiSuggestionSessions` (`src/hooks/franchise/use-franchise-reorganizations.ts`) — when `DEMO_MODE === false`, the hook returns an empty list with `enabled: false` so the AI tab badge reads zero and the realtime cascade for the BE's `005_pending_reality_demo` seed is invisible to the FO user.

**Flipping demo mode back on:** edit `src/constants/config.ts`, set `DEMO_MODE: true`, ship. Same OTA path as any other JS-only change (no `app.json` edits, so `eas update` works — see `.cursor/rules/eas-build-versioning.mdc` Step 0a).

**What this constant does NOT control:**

- The BE-side seeder (`005_pending_reality_demo`). That's gated by the `DEMO_MODE=true` env var on the Render service powering `https://remi-api-ij2v.onrender.com`. Even with the FE flag off, the BE still has 5 AI sessions sitting in its database and broadcasts realtime events for them; the FE just hides them. To stop the BE from creating new ones, flip the Render env var.
- The `@demo-start/end`-tagged operator affordances (Quick Login on the auth screen, Quick Fill VIN on `app/job/[id]/confirm-vehicle.tsx`, the FO Demo Mode panel in `more.tsx`). Those are deliberate, operator-facing demo aids that should stay visible whenever a demo-account user is signed in. They're governed by the `@demo-*` tag system documented below, not by `Config.DEMO_MODE`.
- Other consumers of `useFranchiseReorganizationSessions` (`useKnownReorganizationSessionIds` for cyan-overlay suppression, the FO list views). Those consume `draft` and `pending_review` sessions for legitimate purposes regardless of source. Only the AI-suggestion-source filtered surface is gated.

If a future "auto-displays pretend data the user didn't initiate" surface lands, gate it on `Config.DEMO_MODE` too and add a bullet here so the next "turn demo back on" request is a one-line edit.

## Maintenance Notes

- **2026-05-08 (realtime-clear-guard-and-demo-off):** Added `Config.DEMO_MODE: false` constant in `src/constants/config.ts`. Gated `useAiSuggestionSessions` so it returns empty + `enabled: false` when `DEMO_MODE === false`. No `@demo-start/end` additions or removals — the gate is a config constant, not a tagged removable block. Pairs with the realtime-handler `clear()` guard hardening that landed in the same PR. See PLAN-DEVIATIONS `2026-05-08-cancel-hook-no-auto-coord` (sub-entry "Sibling pass: realtime-clear-guard").
- **2026-05-01 (carfax-oem-tech-cleanup):** Dropped the `DEMO_RECOMMENDATIONS` constant + the silent `try { real } catch { return demo }` fallback in `useVehicleRecommendations` (`src/hooks/jobs/use-recommendations.ts`). Pairs with the sibling REMICustomer change that drops the customer-side `DEMO_OEM_RECOMMENDATIONS` fallback in `src/hooks/vehicles/use-vehicle-health.ts`. The technician-side `GET /vehicles/:vehicleId/recommendations` BE route is still **MISSING** (tracked as row #1 in `docs/implementation-plans/demo-to-production-bundle.md` §C — exists on customer at `customer/index.ts:163-172` but not yet on the technician router); until it ships the hook will 404 and resolve to `[]`, and the only consumer (`RecommendationsSection` in `app/customer/[id].tsx`) already gates on `recs.length === 0` so the section silently hides instead of showing fake data. Tag totals dropped from 43 → 40 (18 → 17 `@demo-start/end` pairs + 2 → 1 `// @demo` singles).
- **2026-04-25 (D2P-FE-14):** Added the FO-only Demo Mode panel in `app/(tabs)/more.tsx` — five new controls (sibling reset, manual AI scan, dual-device mode picker + inline help + APNs status, dev-shortcut visibility toggle, linter strictness picker). One additional `// @demo-start/end` pair (the `DUAL_DEVICE_HELP` table + `DualDeviceModePicker` + `LinterStrictnessPicker` helper components live below the screen and are tagged so they get pulled with the rest of the demo-mode block). Existing pairs were extended to cover the new state, handlers, JSX, and styles in place rather than adding more pair tags inside the same logical region. The new `useDemoSettingsStore` (`src/stores/demo-settings.ts`) is **not** tagged — strictness mode persistence is scaffolding the linter intercept consumes regardless of demo mode (it's the toggle's *value* that's demo-only, not the toggle's existence). When demo mode is removed, the strictness store can either stay (defaulting to strict) or be removed alongside the panel; either is correct. Tag totals incremented from 17 → 18 pairs (37 → 38 individual tags).
- **2026-04-26 (D2P-FE-11):** Dropped the `DEMO_TEAM_WELLNESS` constant + the `try { real } catch { return demo }` block in `useTeamWellness` (`src/hooks/utility/use-team-wellness.ts`); the `DEMO_STANDING` constant + fallback in `useCertificationStanding` (`src/hooks/training/use-certification.ts`); and the `DEMO_ASSIGNED` constant + fallback in `useAssignedTraining` (`src/hooks/training/use-training-modules.ts`) now that D2P-BE-10's `GET /wellness/team`, `GET /certification/standing`, and `GET /training/assigned` are live (`REMIBackend/src/routes/v1/technician/index.ts:1099-1141`). All three hooks now call the BE directly with default TanStack retry behavior; consumers already gracefully handle undefined data (`app/team-wellness.tsx` has an explicit `error && !data` retry branch with `SkeletonTeamWellness` for loading; `app/training/index.tsx` and `app/performance.tsx` short-circuit with `if (!data) return null` / list filters that tolerate `assignedData` being undefined; the home-tab `certStanding` banner in `app/(tabs)/index.tsx:2341` is gated on `certStanding && certStanding.status !== "good"` so loading/error simply hides the banner). Tag totals dropped from 49 → 43 (the prior 46 was a slight under-count; the post-removal grep is now ground truth — 19 `@demo-start/end` pairs + 5 `// @demo` singles). See `docs/implementation-plans/demo-to-production-bundle.md` §C9.
- **2026-04-26 (D2P-FE-10):** Dropped the `DEMO_MODULE_DETAIL` constant + the `try { real } catch { return demo }` block in `useTrainingModule` (`src/hooks/training/use-training-modules.ts`), and the local-grading `// @demo-start/end` fallback inside `AssessmentView.handleSubmit` in `app/training/[moduleId].tsx`, now that D2P-BE-9's `GET /training/modules/:id`, `POST /training/lessons/:lessonId/complete`, and `POST /training/assessments/:assessmentId/submit` are live. `useTrainingModule` now calls the BE directly (no `retry: 0` fallback dance); the assessment flow surfaces submission errors via `Alert.alert` instead of silently grading client-side against hardcoded answer keys. `useCompleteLesson` and `useSubmitAssessment` were already wired to the right endpoints — verified end-to-end against a real module (lessons mark complete; `last_position.lesson_id` persists across kill/relaunch via the BE-side `lesson_completions` upsert; assessment submission round-trips through `assessment_submissions`). `DEMO_ASSIGNED` retained pending D2P-BE-10 / C9. Tag totals dropped from 49 → 46. See `docs/implementation-plans/demo-to-production-bundle.md` §C8.
- **2026-04-26 (D2P-FE-9):** Dropped the `DEMO_STOCK_CUSTOMERS` set, `DEMO_STOCK_VARIANTS` array, `NO_ISSUES` constant, `buildDemoStockCheck()` helper, the `customerName` second parameter on `useJobStockCheck`, and the `try { real } catch { return demo }` block in `useJobStockCheck` (`src/hooks/inventory/use-substitution.ts`) now that D2P-BE-8's `GET /inventory/stock-check/:appointmentId` is live. Also dropped the `customerName` argument at the two call sites (`app/job/[id]/briefing.tsx`, `app/job/[id]/services.tsx`) — those screens already guard the `<StockWarningBanner>` on `stockCheck.data?.has_issues`, and the banner returns null when `has_issues` is false, so the no-issues path renders cleanly without the warning badge. Tag totals dropped from 61 → 49. See `docs/implementation-plans/demo-to-production-bundle.md` §C7.
- **2026-04-20 (P2-FE-7):** Added landscape calendar map-toggle UI (`MapToggleButton` now using shared `EdgeTab`, plus landscape map-mode cross-fade) with no `@demo-start` / `@demo-end` additions or removals. Manifest entries and tag counts remain unchanged.
- **2026-04-21 (P2-FE-5):** ~~Added the floating draft card + 30s rotation handoff (`FloatingDraftCard.tsx`, `HeldDraftCapturer` bridge in `app/(tabs)/index.tsx`)~~ — superseded by the entry below.
- **2026-04-21 (P2-FE-5, course-corrected):** Replaced the floating-draft / 30s handoff model with a tap-to-create persistent-draft flow — rewrote `FloatingDraftCard.tsx` (now backdrop + chooser popover + `useResourcesWithDraft` synthetic-event hook), added a `pendingDraft` slice to `useCalendarStore`, removed the `HeldDraftCapturer` bridge from `app/(tabs)/index.tsx`, threaded `onBlockTap` through both wrapper views and `LandscapeWorkweekView`, mounted `<FloatingDraftCard />` at both calendar roots. No `@demo-start` / `@demo-end` additions or removals. No new seed data or mocks. Manifest entries and tag counts remain unchanged. See PLAN-DEVIATIONS `2026-04-21-tap-to-create-draft` and `2026-04-21-rotation-sideways-draft`.
- **2026-04-23 (P3-FE-5):** Added the three linter UI primitives (`SeverityBadge`, `AutoFixButton`, `LinterEdgeCard`) plus a `__DEV__`-gated dev preview screen at `src/screens/_dev/LinterPrimitivesExample.tsx` with hand-crafted example linter issues. The dev screen is gated on the `__DEV__` build flag (Metro strips it from production bundles) — it is **not** tagged with `@demo-start` / `@demo-end` because it is a standalone preview file, not a block embedded inside production code. No manifest entries or tag counts change.
- **2026-04-26 (D2P-FE-8):** Dropped the `MOCK_VEHICLES` constant + the demo fallback in `useAllFleetDueSoon` and `useFleetNudge` (`src/hooks/use-fleet-due-soon.ts`), plus the demo fallback in `useSendFleetNudge` (`src/hooks/inventory/use-fleet.ts`), now that D2P-BE-8's franchise fleet aggregate (`GET /fleet/due-soon`) and bulk + per-company nudge endpoints (`POST /fleet/nudge`, `POST /fleet/companies/:id/nudge`) are live. All three hooks now call the BE directly; load + error state surfaces through TanStack Query consumers (the Fleet tab already renders distinct empty / loading / error branches per segment, and the bulk-nudge action sheet surfaces mutation errors via toast). Also removed the now-unused `DueSoonSegment` type import from `use-fleet-due-soon.ts` that was orphaned after the `MOCK_VEHICLES` deletion. Tag totals dropped from 67 → 61. See `docs/implementation-plans/demo-to-production-bundle.md` §C6.
- **2026-04-26 (D2P-FE-7):** Dropped the `DEMO_PERFORMANCE` constant + the `try { real } catch { return demo }` block in `useTechPerformance` (`src/hooks/auth/use-performance.ts`) now that D2P-BE-6's `GET /ratings/my-performance` is live. The query function is now a single-line direct call; load + error state surface through the consumer (`app/performance.tsx`) which already handles the `error && !data` branch with a Retry button. Wrapped the "Category Breakdown" section in a `data.categories.length > 0` guard so the screen no longer renders an empty section header — the BE intentionally returns `categories: []` because the schema has no per-category columns (see `docs/PLAN-DEVIATIONS.md#2026-04-26-tech-performance-fe-shape`). Tag totals dropped from 71 → 67. See `docs/implementation-plans/demo-to-production-bundle.md` §C5.
- **2026-04-26 (D2P-FE-6):** Dropped the `DEMO_LEAVE_BY` constant + the `try { real } catch { return demo }` block in `useLeaveByCountdown` (`src/hooks/jobs/use-job-timer.ts`) now that D2P-BE-7's `GET /jobs/:jobId/timer/leave-by` is live. The query function is now a single-line direct call; load + error state surface through the consumer (`app/job/[id]/timer.tsx`) which already gates the leave-by line on `isRunning && liveLeaveBy`. Added an explicit "No more stops today" branch in `timer.tsx` for the case where the BE returns a payload with `next_stop_customer_name === null` (last job of the day) — previously this rendered nothing, which read as a loading state. The green/amber/red `useLiveLeaveBy` state machine is unchanged and now driven exclusively by real route data. Tag totals dropped from 74 → 71. See `docs/implementation-plans/demo-to-production-bundle.md` §C4.
- **2026-04-25 (D2P-FE-5):** Dropped the demo fallbacks for the franchise dispatch alerts + tech-metrics endpoints shipped by D2P-BE-4 — `use-franchise-calendar.ts` (`DEMO_ALERTS` + `DEMO_TECH_METRICS` constants and the `try { real } catch { return demo }` blocks in `useDispatchAlerts` and `useTechnicianMetrics`). Both hooks now surface load + error state directly and accept the required `date: string` (`YYYY-MM-DD`) parameter the BE validates against — without it every live call would 422 (a contract bug the demo fallback was previously masking; caught during the post-deletion smoke test). `CalendarOverviewBar` gained a new `date` prop plumbed through from `useCalendarStore.selectedDate`, plus per-section empty / loading / error rendering: the expanded panel now shows distinct "No alerts", "No technicians scheduled", and "Couldn't load …" copy instead of the previous fake-reassuring "All systems running smoothly" banner that fired whenever both lists were empty. Tag totals dropped from 78 → 74.
- **2026-04-25 (D2P-FE-4):** Dropped the demo fallbacks for the Order Manager note + tag-for-review endpoints aliased by D2P-BE-3 — `use-jobs.ts` (`useAddOrderNote` and `useTagForReview` `try { real } catch { return demo }` blocks). `useAddOrderNote` now invalidates `["jobs", jobId]` + `["jobs"]` + `["franchise-orders"]` on success; `useTagForReview` invalidates the lists plus `["jobs", id]` for every tagged appointment. `OrderNoteSheet` gains an `onError` toast so a failed save now alerts the user instead of silently calling `onClose()` from `onSuccess` only-on-success. Added `FranchiseEndpoints.tagForReview` constant so the franchise call no longer hardcodes the path inline. Tag totals dropped from 82 → 78.
- **2026-04-25 (D2P-FE-3):** Dropped the demo fallbacks for the technician Settings endpoints aliased by D2P-BE-2 — `use-settings.ts` (DEMO_SETTINGS constant + try/catch in `useSettings`; demo-merge fallback in `useUpdateSettings`). Mutation now invalidates the `["settings"]` query key on success and surfaces network errors normally; `app/settings.tsx` gains an explicit error branch with Retry so a failed GET no longer silently renders `DEFAULT_SETTINGS`. Tag totals dropped from 87 → 82.
- **2026-04-25 (D2P-FE-2):** Dropped the demo fallbacks for the three Training endpoints aliased by D2P-BE-1 — `use-training-xp.ts` (DEMO_XP_SUMMARY constant + try/catch), `use-certification.ts` (DEMO_PROGRESS constant + fallback in `useCertificationProgress`; `DEMO_STANDING` retained pending D2P-BE-10 / C9), and `use-scenario.ts` (DEMO_SCENARIO + DEMO_DECISION_SCORES + both fallbacks). Also switched `useSubmitScenarioDecision` to send the BE-native `{ selected_choice_index: number }` payload directly (per Q1 in `docs/implementation-plans/demo-to-production-bundle.md` §B.B4); the `option_id` translator on the BE alias is now an optional safety net rather than load-bearing. Tag totals dropped from 97 → 87.
- **2026-04-25 (D2P-FE-1):** Removed 16 vestigial demo fallbacks across 11 files where the BE endpoint is fully wired — `use-dispatch.ts` (accept + reject), `use-jobs.ts` (export-csv, export-pdf, bulk-mark-paid, send-receipt, report-carfax, retry-carfax — kept the `DEMO_CARFAX_STATUSES` block + `useAddOrderNote` / `useTagForReview` fallbacks pending C2/D2P-BE-2), `use-quicktext.ts`, `use-theme.ts` (`DEMO_THEME` + fallback), `use-copilot.ts` (briefing + suggestions, plus the two `select` upsell-injectors), `use-unified-search.ts` (`DEMO_VEHICLES` + `demoVehicleMatches`), `app/(tabs)/signal.tsx` (`DEMO_POSTS` + fallback), `app/signal/post.tsx` (`DEMO_COMMENTS` + fallback), `use-franchise-calendar.ts` (`DEMO_DISPATCH_OVERVIEW` + fallback only — `DEMO_ALERTS` and `DEMO_TECH_METRICS` retained until C3 / D2P-BE-4). Also added a dedicated `signalApi` client in `src/api/client.ts` + `SIGNAL_API_PREFIX` in `src/constants/config.ts` so signal hooks hit `/api/v1/signal/*` instead of `/api/v1/technician/signal/*`. Tag totals dropped from 137 → 97. See `docs/implementation-plans/demo-to-production-bundle.md` §A.
- **2026-04-23 (P3-FE-2):** Added the portrait-only `PendingRealityFAB` (mounted in both calendar variants in `app/(tabs)/index.tsx`) and a placeholder `/pending-reality/review` screen that dumps the store state JSON. The placeholder route is **not** tagged with `@demo-start` / `@demo-end` because it is the canonical mount point for the dual-mode review surface that lands in P3-FE-4 — the file body will be rewritten in place rather than removed. No manifest entries or tag counts change.

## Tag Convention

| Tag | Meaning | Location |
|-----|---------|----------|
| `// @demo-start` / `// @demo-end` | Block of demo code to remove | `.ts` / `.tsx` files |
| `{/* @demo-start */}` / `{/* @demo-end */}` | Block of demo JSX to remove | `.tsx` files (inside JSX) |
| `// @demo` | Single line of demo code to remove | `.ts` / `.tsx` files |

## Tagged Locations

### `app/(auth)/login.tsx` — 4 blocks + 1 single line

| Lines | Tag type | What to remove |
|-------|----------|---------------|
| 30–58 | `// @demo-start/end` | Email-domain contract comment + `DEMO_ACCOUNTS` (demo personas, `@remi-demo.com`) + `FIELD_TEST_ACCOUNTS` (field-test personas, `@maxi-mobile.com`) + `QuickLoginAccount` union type |
| 109 | `// @demo` | `setValue` in `useForm` destructure (only needed by `fillDemo`) |
| 116–121 | `// @demo-start/end` | `fillDemo()` function |
| 300–347 | `{/* @demo-start/end */}` | Quick Login UI — two panels: "Quick Login — Demo" (2 buttons) and "Quick Login — Field Test" (1 button, amber-accented) |
| 509–556 | `// @demo-start/end` | Demo styles: `demoDivider`, `dividerLine`, `dividerText`, `demoRow`, `demoButton`, `demoButtonText`, `fieldTestDivider`, `fieldTestButton`, `fieldTestButtonText` |

### `app/(tabs)/start-job.tsx` — no demo tags (redirect stub)

The Start Job tab now redirects straight into `/job/new/confirm-vehicle`. Demo Quick Fill moved to `app/job/[id]/confirm-vehicle.tsx` (see below). This file has no `@demo-*` tags.

### `app/job/[id]/confirm-vehicle.tsx` — 3 blocks (walk-in path only)

| Lines | Tag type | What to remove |
|-------|----------|---------------|
| (module) | `// @demo-start/end` | `DEMO_VEHICLES` constant (plate/VIN array for 4 demo vehicles) |
| (JSX) | `{/* @demo-start/end */}` | Quick Fill UI — divider + 4 vehicle auto-fill buttons (walk-in / `id === "new"` only) |
| (styles) | `// @demo-start/end` | Demo styles: `demoDivider`, `demoDividerLine`, `demoDividerText`, `demoGrid`, `demoVehicleBtn`, `demoVehicleLabel`, `demoVehiclePlate` |

### `app/(tabs)/more.tsx` — 7 blocks

| Lines | Tag type | What to remove |
|-------|----------|---------------|
| 20–22 | `// @demo-start/end` | `useQueryClient` import |
| 31–43 | `// @demo-start/end` | `axios`, `AxiosError`, `api`, `Endpoints`, `Config`, `useDispatchOfferStore`, `IncomingDispatch`, `useDemoSettingsStore`, `expo-notifications`, demo-mode types imports |
| 49–51 | `// @demo-start/end` | `queryClient` variable |
| 143–374 | `// @demo-start/end` | `isResetting`, `isResettingWithConflicts`, `isRunningAiScan`, `pushRegistered` state, `setTokens`, `useDemoSettingsStore` selectors / setters (`devShortcutVisible`, `linterStrictness`, `dualDeviceMode`, `setDevShortcutVisible`, `setLinterStrictness`, `setDualDeviceMode`), `handleDemoReset()`, `handleDemoResetWithConflicts()` (D2P-FE-14), `handleRunAiScan()` (D2P-FE-14), `handleDualDeviceModeChange()` (D2P-FE-14), `handleTestDispatch()` functions |
| 577–763 | `{/* @demo-start/end */}` | FO-only Demo Mode panel (D2P-FE-14: sibling reset, AI scan, dual-device picker + help card + push status, dev-shortcut toggle, linter strictness picker) + Reset Demo Data button + Test Dispatch Offer button UI |
| 777–936 | `// @demo-start/end` | `DUAL_DEVICE_HELP` table + `DualDeviceModePicker` + `LinterStrictnessPicker` helper components (D2P-FE-14) |
| 1071–1170 | `// @demo-start/end` | Demo styles: `resetBtn*`, `resetText`, `testDispatch*`, `demoSection*`, `aiScan*`, `pickerCard`, `pickerLabel`, `pickerSubtitle`, `helpCard*`, `pushStatus*`, `pickerStyles` |

### `src/hooks/jobs/use-recommendations.ts` — no demo tags (carfax-oem-tech-cleanup dropped both)

The `DEMO_RECOMMENDATIONS` constant + the silent fallback in `useVehicleRecommendations` were removed in the 2026-05-01 carfax-oem-tech-cleanup change once the sibling REMICustomer worker dropped its mirrored `DEMO_OEM_RECOMMENDATIONS` fallback. The hook now calls the BE directly and resolves to `[]` on error or missing route; `RecommendationsSection` in `app/customer/[id].tsx` already returns `null` when `recs.length === 0`, so the section hides itself until `GET /vehicles/:vehicleId/recommendations` lands on the technician router (tracked in `docs/implementation-plans/demo-to-production-bundle.md` §C row #1).

### `src/api/endpoints.ts` — 1 block

| Lines | Tag type | What to remove |
|-------|----------|---------------|
| 252–256 | `// @demo-start/end` | `demo.reset` endpoint definition |

### `src/hooks/jobs/use-job-timer.ts` — no demo tags (D2P-FE-6 dropped both)

The `DEMO_LEAVE_BY` constant + the demo fallback inside `useLeaveByCountdown` were removed in D2P-FE-6 once `GET /jobs/:jobId/timer/leave-by` (D2P-BE-7) shipped. The hook now calls the endpoint directly; consumers gate on `isRunning && liveLeaveBy` and an explicit "No more stops today" branch.

### `src/hooks/jobs/use-jobs.ts` — 2 blocks (D2P-FE-1 removed 6 wired-endpoint fallbacks; D2P-FE-4 removed the 2 order-note + tag-for-review fallbacks)

| Lines | Tag type | What to remove |
|-------|----------|---------------|
| 27–34 | `// @demo-start/end` | `DEMO_CARFAX_STATUSES` constant (4 sample CARFAX status records cycled by job ID) |
| 41–48 | `// @demo-start/end` | `select` transform in `useJobDetail` that injects demo CARFAX data when backend doesn't provide it |

### `src/hooks/inventory/use-fleet.ts` — no demo tags (D2P-FE-8 dropped the last one)

The `useSendFleetNudge` per-company demo fallback was removed in D2P-FE-8 once `POST /fleet/companies/:companyId/nudge` (D2P-BE-8) shipped. The mutation now calls the endpoint directly; consumers handle errors via TanStack Query's `onError`.

### `src/hooks/use-fleet-due-soon.ts` — no demo tags (D2P-FE-8 dropped both + the constant)

The `MOCK_VEHICLES` constant and the demo fallbacks in `useAllFleetDueSoon` and `useFleetNudge` were removed in D2P-FE-8 once `GET /fleet/due-soon` and `POST /fleet/nudge` (D2P-BE-8) shipped. Both hooks now call the BE directly; the Fleet tab renders distinct empty / loading / error branches per segment.

### `src/hooks/communication/use-messages.ts` — no demo tags (MSG-FE-TECH dropped all of them)

The `DEMO_CONVERSATIONS`, `DEMO_MESSAGES`, `DEMO_TEMPLATES` constants and the four `try { ... } catch { return DEMO_* }` fallbacks across `useConversations`, `useConversationMessages`, `useTemplates`, and `useSendMessage` were all removed in MSG-FE-TECH once the MSG-BE-1 endpoints (`/messages/conversations`, `/messages/conversations/:id`, `/messages/templates`, `POST /messages/conversations/:id/send`) shipped on Render. The hooks now call the BE directly and the WebSocket gateway feeds inbox + thread updates via `useMessagingInboxRealtime` (mounted in `app/(tabs)/_layout.tsx`) and `useConversationRealtime` (mounted on `app/message/[id].tsx`). See `docs/implementation-plans/messaging-redo-plan.md` and `docs/PLAN-DEVIATIONS.md#2026-04-26-msg-redo`.

### `src/hooks/inventory/use-substitution.ts` — no demo tags (D2P-FE-9 dropped all four)

The `DEMO_STOCK_CUSTOMERS` set, `DEMO_STOCK_VARIANTS` array, `NO_ISSUES` constant, `buildDemoStockCheck()` helper, the `customerName` second parameter on `useJobStockCheck`, and the demo fallback inside `useJobStockCheck` were all removed in D2P-FE-9 once `GET /inventory/stock-check/:appointmentId` (D2P-BE-8) shipped. The hook now calls the endpoint directly; consumers (`app/job/[id]/briefing.tsx` + `services.tsx`) already guard the `<StockWarningBanner>` on `stockCheck.data?.has_issues`, and the banner short-circuits when `has_issues` is false, so no warning badge renders for jobs with no stock problems.

### `app/training/[moduleId].tsx` — no demo tags (D2P-FE-10 dropped the last one)

The local assessment scoring fallback with hardcoded correct answers inside `AssessmentView.handleSubmit` was removed in D2P-FE-10 once `POST /training/assessments/:assessmentId/submit` (D2P-BE-9) shipped. Submission errors now surface via `Alert.alert` instead of silently grading client-side against a stale answer key.

### `app/job/[id]/services.tsx` — no demo tags (D2P-FE-9 dropped the last one)

The `customerName` argument that was passed to `useJobStockCheck` was removed in D2P-FE-9 along with the parameter itself on the hook side. The screen still renders the `<StockWarningBanner>` only when `stockCheck.data?.has_issues`.

### `app/job/[id]/briefing.tsx` — no demo tags (D2P-FE-9 dropped the last one)

The `customerName` argument that was passed to `useJobStockCheck` was removed in D2P-FE-9 along with the parameter itself on the hook side. The screen still renders the `<StockWarningBanner>` only when `stockCheck.data?.has_issues`.

### `src/hooks/utility/use-team-wellness.ts` — no demo tags (D2P-FE-11 dropped both)

The `DEMO_TEAM_WELLNESS` constant and the demo fallback in `useTeamWellness` were removed in D2P-FE-11 once `GET /wellness/team` (D2P-BE-10) shipped. The hook now calls the endpoint directly; `app/team-wellness.tsx` already renders `SkeletonTeamWellness` while loading and an explicit "Couldn't load team wellness" + Retry branch on error.

### `src/hooks/training/use-training-modules.ts` — no demo tags (D2P-FE-10 + D2P-FE-11 dropped both)

The `DEMO_MODULE_DETAIL` constant and its fallback were removed in D2P-FE-10 (D2P-BE-9). The `DEMO_ASSIGNED` constant and the fallback in `useAssignedTraining` were removed in D2P-FE-11 once `GET /training/assigned` (D2P-BE-10) shipped. The hook now calls the endpoint directly; `app/training/index.tsx` already gates the assigned-training section on `assignedData && assignedData.items.length > 0`, and the re-training banner derivation tolerates `assignedData` being undefined via `?? []`.

### `src/hooks/training/use-certification.ts` — no demo tags (D2P-FE-2 + D2P-FE-11 dropped both)

The `DEMO_PROGRESS` constant + its fallback were removed in D2P-FE-2 (D2P-BE-1 alias). The `DEMO_STANDING` constant + the fallback in `useCertificationStanding` were removed in D2P-FE-11 once `GET /certification/standing` (D2P-BE-10) shipped. The hook now calls the endpoint directly; `app/performance.tsx` short-circuits with `if (!standing) return null` and the home-tab banner in `app/(tabs)/index.tsx` is gated on `certStanding && certStanding.status !== "good" && certStanding.required_training.length > 0`, so loading/error states simply hide the banner.

## Tag Count Summary

| File | `@demo-start/end` pairs | `@demo` single lines | Total tags |
|------|------------------------|---------------------|------------|
| `app/(auth)/login.tsx` | 4 | 1 | 9 |
| `app/job/[id]/confirm-vehicle.tsx` | 3 | 0 | 6 |
| `app/(tabs)/more.tsx` | 7 | 0 | 14 |
| `src/api/endpoints.ts` | 1 | 0 | 2 |
| `src/hooks/jobs/use-jobs.ts` | 2 | 0 | 4 |
| **Total** | **17 pairs** | **1** | **35** |

## Route Demo Data (Backend)

The Route tab displays data that originates entirely from backend demo seeds — no external APIs are involved locally.

### How routes get seeded

- `003_demo_data.ts` and `004_calendar_stress_data.ts` in the backend insert `routes` and `route_stops` rows directly into the database with synthetic coordinates, sequential `stop_order` values, and invented ETAs/drive times
- On non-production startup, the backend checks if today's demo routes exist; if not, it calls `resetDemoData()` to re-seed everything
- Route IDs are auto-incremented — the specific ID (e.g., 2316) is environment-dependent, not hardcoded

### Route optimization dependency

- `POST /api/v1/technician/routes/optimize` calls the **Google Cloud Route Optimization API** (`optimizeTours`) via `google-route-optimization.service.ts`
- Requires `GOOGLE_CLOUD_PROJECT_ID` env var and Google OAuth2 service account credentials
- **Neither is configured locally** — optimization always fails with a 500 in local dev
- The backend has (or should have) a **local fallback**: when Google fails, stops are sorted by `scheduled_time` ascending and `stop_order` is updated accordingly
- The frontend calls optimize after every technician reschedule (`useTechnicianRescheduleAppointment.onSettled`). Failure is caught silently — the reschedule still succeeds

### What this means for demo testing

- Routes display correctly (seeded data)
- Drag-to-reschedule works (appointment times update)
- Route stop order updates after reschedule only if the backend fallback sort is active
- Full Google-powered optimization (drive time, distance, optimal sequencing) requires production Google Cloud credentials

## What is NOT Demo Code

These features were built during the demo phase but are **production features** — do not remove:

- `app/(auth)/login.tsx` — Show/Hide password toggle (not tagged — real UX feature)
- `app/(tabs)/index.tsx` — Week navigation arrows (not tagged — real navigation feature)
- `app/(tabs)/more.tsx` — Avatar editor tap, action sheet, `AvatarEditor` modal, `useUploadAvatar` hook (production profile editing)
- `src/components/shared/avatar-editor.tsx` — Gesture-based circular avatar crop/zoom/pan editor (production component)
- `src/hooks/auth/use-upload-avatar.ts` — Avatar upload mutation (production hook)
- All Phase 4 screens (inventory, fleet, shield, training, referral) — production features
- All hooks in `src/hooks/` — production API integration
- All types in `src/types/` — production type definitions

## Removal

There is no automated removal script in this repo (the backend has `scripts/remove-demo.ts`). To remove demo code manually:

1. Search for `@demo-start` / `@demo-end` and delete the opening tag, closing tag, and everything between them
2. Search for `// @demo` and delete those single lines
3. Clean up any orphaned imports or empty lines left behind
4. Verify the app builds:

```bash
npx expo export --platform ios 2>&1 | head -20
```

Alternatively, adapt the backend's `scripts/remove-demo.ts` to also process `.tsx` files and JSX comment markers (`{/* ... */}`).
