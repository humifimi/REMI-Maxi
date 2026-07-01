# REMI-OS (local monorepo)

Single repository for REMI field operations. **No GitHub remotes or Actions** — development and CI run entirely on your machine.

## Layout

```
Remi-OS/
├── apps/
│   ├── mobile/      Unified Expo app (technician + customer harvest)
│   ├── api/         Node backend (unchanged logic, Phase 1–5)
│   └── dashboard/   Web admin placeholder
├── packages/        Shared code stubs (@remi/types, auth, ui, …)
├── docs/            Monorepo strategy and migration guides
└── scripts/         ci-local.js — run tests/lint without GitHub
```

## Android builds (JDK)

Gradle does **not** support JDK 26. Use **JDK 17** for `expo run:android` / native builds:

```powershell
winget install Microsoft.OpenJDK.17
```

`apps/mobile/android/gradle.properties` sets `org.gradle.java.home` to the Microsoft JDK 17 path. After installing, **close and reopen the terminal**, then:

```powershell
cd apps/mobile/android
.\gradlew.bat --stop
cd ..
npm start
```

Or in one session: `.\scripts\use-jdk17.ps1` then `npx expo run:android`.

## Quick start

```bash
# API
cd apps/api && npm install && npm run dev

# Mobile (technician default; customer routes under app/customer/)
cd apps/mobile && npm install && npm start
```

From repo root (after `npm install` at root):

```bash
npm run api
npm run mobile
npm run ci:local
```

## Modes (mobile)

| Mode | Status | Location |
|------|--------|----------|
| Technician | Active (default) | `app/(tabs)/`, … routes in `app/`; code `@technician/*` → `src/modes/technician/` |
| Customer | Harvested | `app/customer/*`, `@customer/*` → `src/modes/customer/` |
| Fleet-manager | Future | `src/modes/fleet-manager/` |
| Operator | Future | `src/modes/operator/` |

## Local-only policy

- `.github/` workflows removed (no `api.github.com` doc sync, no remote CI).
- Internal PR links in historical docs replaced with `(see local DEVELOPMENT-LOG)`.
- Use `npm run ci:local` instead of GitHub Actions.

See `docs/MONOREPO-IMPLEMENTATION-PLAN.md` for phased merge steps.
