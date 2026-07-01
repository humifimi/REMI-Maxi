# Customer mode (harvested)

Customer app code from REMI-Customer. Expo routes: **`app/customer/*`** (URLs like `/customer/welcome`).

## Layout

| Area | Path |
|------|------|
| Routes | `app/customer/` |
| Source | `src/modes/customer/` (`@customer/*`) |
| Promoted stores | `src/stores/customer/` (booking, onboarding, demo-*) |

## Shared with technician

- `src/stores/auth.ts`, `app-mode.ts`, `customer-theme.ts`
- `src/components/shared/app-mode-switch.tsx`
- Mode redirect: `src/navigation/app-mode-redirect.tsx`

Imports in this tree use `@customer/*` for customer modules and `@/src/stores/...` for shared shell stores.
