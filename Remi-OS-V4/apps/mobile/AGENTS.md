# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

REMI Technician is an Expo 54 / React Native 0.81 mobile app for field-service technicians and franchise owners. It is a **client-only repo** — the backend API (`REMIBackend`) is a separate codebase hosted on Render.

### Key commands

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Start dev server | `npx expo start` |
| Lint | `npx expo lint` |
| Type-check | `npx tsc --noEmit` |
| Run tests | `npm test` (or `npx jest`) |
| Run single test | `npx jest <path>` |
| Export bundle (iOS) | `npx expo export --platform ios` |

### Running the Metro dev server

- `npx expo start` launches Metro on port 8081.
- Verify it is running: `curl -s http://localhost:8081/status` should return `packager-status:running`.
- This is a React Native app — it cannot run in a standard web browser (web bundling is blocked by `react-native-maps`). The dev server serves JS bundles to iOS/Android devices or simulators.
- No iOS Simulator or Android Emulator is available in the Cloud Agent VM, so manual GUI testing of the app UI is **not possible**. Use `npx expo export --platform ios` to verify the full bundle compiles.

### Pre-existing issues (not caused by setup)

- **Lint**: 32 pre-existing errors (mostly `react/no-unescaped-entities`) and ~349 warnings. These are in the repo's main branch.
- **TypeScript**: ~17 pre-existing type errors (WebRTC types, deprecated Expo APIs, missing node types for vendor code).
- **Tests**: 10 of 86 test suites fail (71 of 1186 tests). Failures are pre-existing — dynamic import issues (`--experimental-vm-modules`), babel transform errors on certain test files. 76 suites / 1115 tests pass.

### Backend connectivity

- API config lives in `src/constants/config.ts`. In dev mode, the API base URL resolves to `http://<metro-host>:3000`. The production URL is `https://remi-api-ij2v.onrender.com`.
- The backend is NOT in this repo. Without it running locally, all data-fetching hooks will fail at runtime on a device, but the bundler and tests work independently.

### Vendored packages

- `vendor/react-native-resource-calendar/` — local fork linked via `file:` in `package.json`. `npm install` handles linking automatically.
- `vendor/profit-model/` — pure TypeScript profit calculation engine, aliased via `@profit-model/*` in `tsconfig.json`.

### Branch hygiene

A git `commit-msg` hook (`.githooks/commit-msg`) blocks commits on `main`/`master`. Create a feature branch first: `git checkout -b <branch-name>`. See `.cursor/rules/branch-hygiene.mdc` for conventions.
