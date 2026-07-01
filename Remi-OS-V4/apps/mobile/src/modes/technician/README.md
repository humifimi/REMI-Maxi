# Technician mode

Technician UI and domain logic live here. **Expo routes stay in `app/`** (URLs unchanged).

## Layout

| Area | Path |
|------|------|
| Routes | `app/(tabs)/`, `app/(auth)/`, `app/job/`, `app/fleet/`, … |
| API / hooks / components / stores | `src/modes/technician/` |
| Import alias | `@technician/*` → `./src/modes/technician/*` |

## Shared shell (not in this tree)

- `src/components/shared/` — root `Providers`, mode switch, capability helpers
- `src/stores/auth.ts`, `app-mode.ts`, `customer-theme.ts`, `stores/customer/`
- `src/navigation/app-mode-redirect.tsx`

Customer mode mirror: `src/modes/customer/` + `app/customer/*` (`@customer/*`).
