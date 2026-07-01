# Calendar Feature — Data Layer Implementation Plan

## Scope

Build the **data layer** (types, constants, API endpoints, TanStack Query hooks, Zustand store) for the Calendar feature upgrade in the REMITechnician repo. This is Steps 1–3 of the `docs/REMI-Calendar-TechApp.md` implementation guide — the foundation that all calendar UI components will consume.

The Node.js backend at `/Users/jacegalloway/Documents/codebases/REMIBackend` is **already fully built** — routes, controllers, services, models, schemas, and migrations all exist. This plan wires the mobile app to that backend.

## Reference Documents

- **Frontend guide:** `docs/REMI-Calendar-TechApp.md` — Steps 1–3 (types, endpoints/hooks, store)
- **Full spec:** `docs/REMI-Calendar-Spec.md` — canonical data model, API surface, behavior definitions
- **Backend guide:** `/Users/jacegalloway/Documents/Docs/docs/calendar/REMI-Calendar-Backend.md` — exact endpoint paths and response shapes
- **Visual reference:** `/Users/jacegalloway/Downloads/Screenshots/contact_sheets/` — 11 contact sheets showing the competitor app flow

## Backend State (already built)

| Layer | File | Lines | Status |
|-------|------|-------|--------|
| Routes (franchise) | `REMIBackend/src/routes/v1/franchise/calendar.ts` | 157 | Full |
| Routes (technician) | `REMIBackend/src/routes/v1/technician/calendar.ts` | 47 | Full |
| Controller | `REMIBackend/src/controllers/calendar.controller.ts` | 270 | Full |
| Service | `REMIBackend/src/services/calendar.service.ts` | 861 | Full |
| Alert service | `REMIBackend/src/services/calendar-alert.service.ts` | 208 | Full |
| Models/types | `REMIBackend/src/models/calendar.ts` | 387 | Full |
| Validation schemas | `REMIBackend/src/routes/v1/schemas/calendar.schemas.ts` | 229 | Full |
| Migrations | 7 files (`20260409000001` – `20260409000007`) | — | Full |

## Files to Create (new)

| File | Purpose |
|------|---------|
| `src/types/calendar.ts` | Calendar-specific TypeScript interfaces and payload types |
| `src/constants/calendar.ts` | Calendar config, slot type colors, zoom levels, booking labels |
| `src/hooks/use-calendar.ts` | TanStack Query hooks: day/week/month view, appointment CRUD, reschedule, cancel, no-show |
| `src/hooks/use-personal-events.ts` | Personal event CRUD hooks |
| `src/hooks/use-flex-list.ts` | Flex List query and mutation hooks |
| `src/hooks/use-generate-appointment.ts` | AI scheduling suggestion hook |
| `src/hooks/use-calendar-customers.ts` | Customer search + quick-create hooks for appointment form |
| `src/hooks/use-calendar-services.ts` | Service catalog query hook |
| `src/hooks/use-quicktext.ts` | QuickText send mutation hook |
| `src/hooks/use-tax-rates.ts` | Franchise tax rate query and upsert hooks |
| `src/stores/calendar.ts` | Zustand store for calendar view state (view mode, date, zoom, filters, etc.) |

## Files to Modify (existing)

| File | Change |
|------|--------|
| `src/types/enums.ts` | Add `SlotType`, `BookingMethod`, `LocationType`, `NotificationPreference`, `FlexListStatus`, `AlertType`, `CalendarAlertSeverity`, `QuickTextTemplate` |
| `src/api/endpoints.ts` | Add `calendar` to `Endpoints` (technician) and `calendarV2` to `FranchiseEndpoints` (franchise) |
| `src/constants/colors.ts` | Add `SlotTypeColors`, `SlotTypeBgColors`, `SlotTypeLabels`, `CalendarAlertSeverityColors` |
| `docs/DEVELOPMENT-LOG.md` | Append Calendar Data Layer section |
| `README.md` | Update project structure and feature list |
| `DEMO-CODE.md` | Update line numbers if demo blocks shifted |

---

## Phase 1 — Dependencies

**Todo: `deps`**

Install new dependencies needed by the calendar feature:

```bash
npx expo install @howljs/calendar-kit -- --legacy-peer-deps
npx expo install @gorhom/bottom-sheet -- --legacy-peer-deps
npx expo install dayjs -- --legacy-peer-deps
```

Verify these are already installed (no action if present):
- `expo-haptics`
- `react-native-reanimated`
- `react-native-gesture-handler`

Verify `react-native-reanimated/plugin` is in `babel.config.js`.

---

## Phase 2 — Types and Enums

**Todo: `types-enums`**

### `src/types/enums.ts` — Add to existing file

Add these const-object enums following the established pattern:

- `SlotType` — `standard`, `eco`, `priority`, `flex_window`
- `BookingMethod` — `manual`, `generated`, `batch`, `recurring`
- `LocationType` — `shop`, `customer`
- `NotificationPreference` — `email_and_text`, `text`, `email`, `none`
- `FlexListStatus` — `waiting`, `offered`, `booked`, `expired`
- `AlertType` — `deadhead`, `unqualified_tech`, `inventory_concern`, `running_late`
- `CalendarAlertSeverity` — `warning`, `critical`
- `QuickTextTemplate` — `arrival`, `on_site`, `ahead_of_schedule`, `job_complete`

Follow the exact same pattern as existing enums (const object + type extraction).

### `src/types/calendar.ts` — Create new file

Mirror the backend `src/models/calendar.ts` types. All interfaces must match the API response shapes from the backend spec. Key types:

**Calendar views:**
- `CalendarAppointmentItem` — enriched appointment for calendar display (id, franchise_id, technician_id, customer_id, customer_name, service_names, status, start_time, end_time, duration_minutes, slot_type, booking_method, location_type, appointment_note, notification_preference, explanation, scoring_factors, alerts, vehicle_summary, address_line, address_city, total_amount, fleet_company_name, recurrence_series_id)
- `CalendarTechnicianDay` — { technician_id, technician_name, appointments[], availability }
- `CalendarDayResponse` — { date, technicians: CalendarTechnicianDay[], personal_events: PersonalEvent[] }
- `MonthViewDay` — { date, appointment_count, capacity: 'light' | 'moderate' | 'full', status_breakdown }
- `MonthViewResponse` — { days: MonthViewDay[] }

**Personal events:**
- `PersonalEvent` — { id, franchise_id, created_by, title, date, start_time, end_time, duration_minutes, recurrence_rule, shared_with, notes, created_at, updated_at }

**Flex list:**
- `FlexListEntry` — { id, franchise_id, customer_id, customer_name, customer_phone, preferred_service_id, preferred_vehicle_id, preferred_time_window, preferred_technician_id, notes, status: FlexListStatus, offered_at, created_at }

**Alerts:**
- `AppointmentAlertItem` — { id, type: AlertType, message, severity: CalendarAlertSeverity }

**Scoring:**
- `ScoringFactors` — { preference, route_efficiency, technician_familiarity, skill_inventory_match, business_priority, schedule_fit, total_score }

**Tax:**
- `FranchiseTaxRate` — { id, franchise_id, jurisdiction, rate, is_active }
- `AppointmentTaxLine` — { id, appointment_id, jurisdiction, rate, amount }

**Customer/service for form:**
- `CustomerSearchResult` — { id, full_name, phone, email, vehicle_count, last_visit_date }
- `ServiceListItem` — { id, name, base_price, duration_minutes }

**Payloads (client → server):**
- `CreateAppointmentPayload` — { customer_id, service_ids, technician_id, start_time, end_time, location_type, location_address?, appointment_note?, notification_preference, slot_type? }
- `UpdateAppointmentPayload` — Partial of create
- `ReschedulePayload` — { new_start_time, new_end_time, new_technician_id?, notification_preference, custom_message? }
- `CancelPayload` — { reason?, notification_preference, custom_message? }
- `NoShowPayload` — { notify_customer?: boolean }
- `GenerateAppointmentPayload` — { customer_id, service_ids, preferred_date_start, preferred_date_end, location_type, location_address? }
- `CreatePersonalEventPayload` — { title, date, start_time, end_time, recurrence_rule?, shared_with, notes? }
- `QuickTextPayload` — { template: QuickTextTemplate }
- `CreateFlexListEntryPayload` — { customer_id, preferred_service_id?, preferred_vehicle_id?, preferred_time_window?, preferred_technician_id?, notes? }
- `FlexListOfferPayload` — { custom_message? }
- `QuickCreateCustomerPayload` — { name, phone, email? }
- `TaxRateUpsertPayload` — { jurisdiction, rate }
- `LocationAddress` — { line_1, line_2?, city, state, zip, country? }

**AI scheduling results:**
- `ScoredSlot` — { technician_id, technician_name, date, start_time, end_time, score, explanation, scoring_factors: ScoringFactors }

**Route visualization:**
- `RouteVisualizationResponse` — { technicians: RouteVisualizationTechnician[] }
- `RouteVisualizationTechnician` — { id, name, color, route: { stops, polyline?, total_drive_minutes, total_distance_miles }, current_location? }
- `RouteVisualizationStop` — { appointment_id, customer_name, address, lat, lng, time, status }

**Briefing:**
- `FranchiseBriefing` — { date, total_jobs, completed, pending, delayed, fleet_alerts, technician_alerts, optimization_suggestions, weather_alert?, revenue_today }

**Calendar service items:**
- `CalendarServiceItem` — { service_id, service_code, service_name, price, technician_qualified }

---

## Phase 3 — Constants and Colors

**Todo: `constants-colors`**

### `src/constants/calendar.ts` — Create new file

```typescript
export const CALENDAR_CONFIG = {
  DEFAULT_START_HOUR: 6,
  DEFAULT_END_HOUR: 20,
  MIN_ZOOM_HOURS: 4,
  MAX_ZOOM_HOURS: 16,
  DEFAULT_ZOOM_HOURS: 10,
  DRAG_STEP_MINUTES: 15,
  STALE_TIME_MS: 30_000,
  REFETCH_INTERVAL_MS: 60_000,
} as const;

export const SLOT_TYPE_COLORS = {
  standard:    { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8' },
  eco:         { bg: '#F0FDF4', border: '#22C55E', text: '#15803D' },
  priority:    { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  flex_window: { bg: '#F5F3FF', border: '#8B5CF6', text: '#5B21B6' },
} as const;

export const ALERT_SEVERITY_COLORS = {
  warning: '#F59E0B',
  critical: '#EF4444',
} as const;

export const BOOKING_METHOD_LABELS = {
  manual: 'Manual',
  generated: 'AI Suggested',
  batch: 'Fleet Batch',
  recurring: 'Recurring',
} as const;

export const NOTIFICATION_PREF_OPTIONS = [
  { value: 'email_and_text', label: 'Email & Text' },
  { value: 'text', label: 'Text Only' },
  { value: 'email', label: 'Email Only' },
  { value: 'none', label: 'No Notification' },
] as const;
```

### `src/constants/colors.ts` — Add to existing file

Add after the Bug Reporter section:

```typescript
import type { SlotType, CalendarAlertSeverity } from "@/src/types/enums";

export const SlotTypeColors: Record<SlotType, string> = {
  standard: '#3B82F6',
  eco: '#22C55E',
  priority: '#F59E0B',
  flex_window: '#8B5CF6',
};

export const SlotTypeBgColors: Record<SlotType, string> = {
  standard: '#EFF6FF',
  eco: '#F0FDF4',
  priority: '#FEF3C7',
  flex_window: '#F5F3FF',
};

export const SlotTypeLabels: Record<SlotType, string> = {
  standard: 'Standard',
  eco: 'Eco',
  priority: 'Priority',
  flex_window: 'Flex Window',
};

export const CalendarAlertSeverityColors: Record<CalendarAlertSeverity, string> = {
  warning: '#F59E0B',
  critical: '#EF4444',
};
```

---

## Phase 4 — API Endpoints

**Todo: `api-endpoints`**

### `src/api/endpoints.ts` — Add to `Endpoints` (technician)

```typescript
calendar: {
  dayView: (date: string) => `/calendar/day/${date}`,
  weekView: (startDate: string) => `/calendar/week/${startDate}`,
  createPersonalEvent: '/calendar/personal-events',
  updatePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
  deletePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
  quicktext: (appointmentId: number) => `/calendar/appointments/${appointmentId}/quicktext`,
},
```

### `src/api/endpoints.ts` — Add to `FranchiseEndpoints`

```typescript
calendarV2: {
  dayView: (date: string) => `/calendar/day/${date}`,
  weekView: (startDate: string) => `/calendar/week/${startDate}`,
  monthView: (year: number, month: number) => `/calendar/month/${year}/${month}`,
  createAppointment: '/calendar/appointments',
  updateAppointment: (id: number) => `/calendar/appointments/${id}`,
  appointmentDetail: (id: number) => `/calendar/appointments/${id}`,
  cancelAppointment: (id: number) => `/calendar/appointments/${id}/cancel`,
  noShowAppointment: (id: number) => `/calendar/appointments/${id}/no-show`,
  rescheduleAppointment: (id: number) => `/calendar/appointments/${id}/reschedule`,
  quicktext: (id: number) => `/calendar/appointments/${id}/quicktext`,
  generateAppointment: '/calendar/appointments/generate',
  customerSearch: '/calendar/customers/search',
  recentCustomers: '/calendar/customers/recent',
  quickCreateCustomer: '/calendar/customers',
  services: '/calendar/services',
  createPersonalEvent: '/calendar/personal-events',
  updatePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
  deletePersonalEvent: (id: string) => `/calendar/personal-events/${id}`,
  personalEventDetail: (id: string) => `/calendar/personal-events/${id}`,
  flexList: '/calendar/flex-list',
  flexListOffer: (id: string) => `/calendar/flex-list/${id}/offer`,
  taxRates: '/calendar/tax-rates',
  briefing: (date: string) => `/calendar/briefing/${date}`,
  routeVisualization: (date: string) => `/calendar/routes/${date}`,
},
```

Keep the existing `calendar` and `reassign` keys in `FranchiseEndpoints` as legacy fallbacks.

---

## Phase 5 — TanStack Query Hooks: Calendar Core

**Todo: `hooks-calendar`**

### `src/hooks/use-calendar.ts` — Create new file

This is the primary hook file for calendar data fetching. Uses `franchiseApi()` for franchise endpoints and `api()` for technician endpoints. Follow the established patterns in `use-franchise-calendar.ts`, `use-routes.ts`, and `use-schedule.ts`.

**Query key factory:**
```typescript
const calendarKeys = {
  all: ['calendar'] as const,
  day: (date: string) => [...calendarKeys.all, 'day', date] as const,
  week: (startDate: string) => [...calendarKeys.all, 'week', startDate] as const,
  month: (year: number, month: number) => [...calendarKeys.all, 'month', year, month] as const,
  appointmentDetail: (id: number) => [...calendarKeys.all, 'appointment', id] as const,
};
```

**Queries:**
- `useFranchiseDayView(date: string)` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.dayView(date)` → `CalendarDayResponse`. StaleTime 30s. Enabled when `date` is truthy.
- `useFranchiseWeekView(startDate: string)` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.weekView(startDate)` → `CalendarDayResponse[]`. StaleTime 30s.
- `useFranchiseMonthView(year: number, month: number)` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.monthView(year, month)` → `MonthViewResponse`. StaleTime 60s.
- `useTechnicianDayView(date: string)` — `GET api` → `Endpoints.calendar.dayView(date)` → `CalendarDayResponse`. StaleTime 30s.
- `useTechnicianWeekView(startDate: string)` — `GET api` → `Endpoints.calendar.weekView(startDate)` → `CalendarDayResponse[]`. StaleTime 30s.
- `useAppointmentDetail(id: number)` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.appointmentDetail(id)` → `CalendarAppointmentItem`. Enabled when `id > 0`.

**Mutations (all invalidate `calendarKeys.all` and `['dispatch-overview']` on success):**
- `useCreateAppointment()` — `POST franchiseApi` → `FranchiseEndpoints.calendarV2.createAppointment` with `CreateAppointmentPayload`.
- `useUpdateAppointment()` — `PUT franchiseApi` → `FranchiseEndpoints.calendarV2.updateAppointment(id)` with `UpdateAppointmentPayload`.
- `useCancelAppointment()` — `PUT franchiseApi` → `FranchiseEndpoints.calendarV2.cancelAppointment(id)` with `CancelPayload`. Response: `{ cancelled: true, flex_matches: FlexListEntry[] }`.
- `useNoShowAppointment()` — `PUT franchiseApi` → `FranchiseEndpoints.calendarV2.noShowAppointment(id)` with `NoShowPayload`.
- `useRescheduleAppointment()` — `PUT franchiseApi` → `FranchiseEndpoints.calendarV2.rescheduleAppointment(id)` with `ReschedulePayload`.

---

## Phase 6 — TanStack Query Hooks: Supporting Domains

**Todo: `hooks-personal-events`**

### `src/hooks/use-personal-events.ts`

Role-aware hooks — technicians use `api()`, franchise owners use `franchiseApi()`.

**Mutations:**
- `useCreatePersonalEvent()` — `POST` to the appropriate endpoint. Invalidates `calendarKeys.all`.
- `useUpdatePersonalEvent()` — `PUT`. Invalidates `calendarKeys.all`.
- `useDeletePersonalEvent()` — `DELETE`. Invalidates `calendarKeys.all`.

---

**Todo: `hooks-flex-list`**

### `src/hooks/use-flex-list.ts`

Franchise-only hooks.

```typescript
const flexListKeys = {
  all: ['flex-list'] as const,
  byStatus: (status?: string) => [...flexListKeys.all, status] as const,
};
```

- `useFlexList(status?: FlexListStatus)` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.flexList` with optional `?status=` param. Returns `FlexListEntry[]`.
- `useAddFlexListEntry()` — `POST` mutation. Invalidates `flexListKeys.all`.
- `useOfferFlexListSlot()` — `POST franchiseApi` → `FranchiseEndpoints.calendarV2.flexListOffer(id)`. Invalidates `flexListKeys.all`.

---

**Todo: `hooks-generate-appointment`**

### `src/hooks/use-generate-appointment.ts`

- `useGenerateAppointment()` — `POST franchiseApi` → `FranchiseEndpoints.calendarV2.generateAppointment` with `GenerateAppointmentPayload`. Returns `ScoredSlot[]`. This is a mutation (not a query) since it triggers server-side computation.

---

**Todo: `hooks-customers-services`**

### `src/hooks/use-calendar-customers.ts`

```typescript
const customerKeys = {
  all: ['calendar-customers'] as const,
  search: (query: string) => [...customerKeys.all, 'search', query] as const,
  recent: [...customerKeys.all, 'recent'] as const,
};
```

- `useCustomerSearch(query: string)` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.customerSearch` with `{ q: query }`. Enabled when `query.length >= 1`. Returns `CustomerSearchResult[]`. StaleTime 0 (always fresh).
- `useRecentCustomers()` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.recentCustomers`. Returns `CustomerSearchResult[]`.
- `useQuickCreateCustomer()` — `POST franchiseApi` → `FranchiseEndpoints.calendarV2.quickCreateCustomer`. Invalidates `customerKeys.all`.

### `src/hooks/use-calendar-services.ts`

- `useCalendarServices()` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.services`. Returns `ServiceListItem[]`. StaleTime 60s.

---

**Todo: `hooks-quicktext-tax`**

### `src/hooks/use-quicktext.ts`

Role-aware — technicians send QuickText on their own appointments via `api()`, franchise owners via `franchiseApi()`.

- `useSendQuickText()` — `POST` to the appropriate quicktext endpoint with `{ template }`. No query invalidation needed (QuickText log is server-side).

### `src/hooks/use-tax-rates.ts`

Franchise-only.

```typescript
const taxRateKeys = {
  all: ['tax-rates'] as const,
};
```

- `useTaxRates()` — `GET franchiseApi` → `FranchiseEndpoints.calendarV2.taxRates`. Returns `FranchiseTaxRate[]`. StaleTime 60s.
- `useUpsertTaxRate()` — `PUT franchiseApi` → `FranchiseEndpoints.calendarV2.taxRates` with `TaxRateUpsertPayload`. Invalidates `taxRateKeys.all`.

---

## Phase 7 — Zustand Calendar Store

**Todo: `zustand-store`**

### `src/stores/calendar.ts` — Create new file

Follow the pattern from `src/stores/job-flow.ts` (Zustand `create()`, typed interface, initial state, action methods).

**State shape:**
```typescript
interface CalendarState {
  viewMode: 'day' | 'week' | 'month';
  selectedDate: string;            // YYYY-MM-DD, defaults to today
  zoomLevel: number;               // hours visible in viewport
  scrollPosition: number;          // minutes from midnight
  visibleTechnicians: number[];    // technician IDs shown (franchise only)
  filterStatus: string[];          // appointment status filters
  filterSlotType: string[];        // slot type filters
  showMap: boolean;

  // Actions
  setViewMode: (mode: 'day' | 'week' | 'month') => void;
  setSelectedDate: (date: string) => void;
  goToNextDay: () => void;
  goToPreviousDay: () => void;
  goToNextWeek: () => void;
  goToPreviousWeek: () => void;
  goToToday: () => void;
  setZoomLevel: (hours: number) => void;
  setScrollPosition: (minutes: number) => void;
  toggleTechnician: (techId: number) => void;
  setVisibleTechnicians: (ids: number[]) => void;
  setFilterStatus: (statuses: string[]) => void;
  setFilterSlotType: (types: string[]) => void;
  toggleMap: () => void;
  reset: () => void;
}
```

**Persistence:** Use `zustand/middleware` `persist` with `@react-native-async-storage/async-storage` to persist `viewMode`, `zoomLevel`, and `visibleTechnicians` across sessions. This matches the spec's requirement for cross-session continuity.

**Date navigation:** Import `dayjs` for `goToNextDay`, `goToPreviousDay`, `goToNextWeek`, `goToPreviousWeek` — add/subtract 1 day or 7 days from `selectedDate`.

**Zoom bounds:** `setZoomLevel` clamps between `CALENDAR_CONFIG.MIN_ZOOM_HOURS` and `CALENDAR_CONFIG.MAX_ZOOM_HOURS`.

---

## Phase 8 — Update Documentation

**Todo: `update-docs`**

### `docs/DEVELOPMENT-LOG.md`

Append a "Calendar Feature — Data Layer" section documenting:
- Dependencies installed
- New files created (types, constants, hooks, store)
- Files modified (enums, endpoints, colors)
- Architecture decisions (query key factory pattern, dual API client routing, Zustand persistence choices)
- What this enables (foundation for UI components in Steps 4–16 of TechApp.md)

### `README.md`

- Update "Project Structure" tree to include `src/stores/calendar.ts`, new hooks, and `src/constants/calendar.ts`
- Add a "Calendar" feature section describing the data layer capabilities

### `DEMO-CODE.md`

- Check if any `@demo` tag line numbers shifted due to changes in `src/api/endpoints.ts`
- Update the manifest if needed

---

## Verification

After each phase, run TypeScript type checking:
```bash
npx tsc --noEmit 2>&1 | head -60
```

Confirm:
1. Zero new TypeScript errors introduced
2. All new types align with the backend response shapes in `REMIBackend/src/models/calendar.ts`
3. All endpoint paths match the backend routes in `REMIBackend/src/routes/v1/franchise/calendar.ts` and `REMIBackend/src/routes/v1/technician/calendar.ts`
4. Query key patterns are consistent and mutations invalidate the correct keys
5. Zustand store actions produce correct date math
