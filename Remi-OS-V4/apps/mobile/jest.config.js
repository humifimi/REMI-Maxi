/**
 * Jest configuration for REMITechnician.
 *
 * Uses the `jest-expo` preset, which:
 *   - configures Babel for the Expo SDK 54 toolchain (RN 0.81 + React 19)
 *   - mocks the native side of every Expo SDK module
 *   - sets `testMatch` to pick up both `*.test.{ts,tsx}` and
 *     `*-test.{ts,tsx}` under `__tests__/` (matches the existing
 *     `src/**\/__tests__\/*.test.tsx` layout)
 *
 * `jest-expo` also pre-populates `transformIgnorePatterns` with the
 * common RN/Expo allowlist; we extend it for the third-party libs we
 * actually consume from source (gesture-handler, reanimated, the
 * `@react-native(-community)?` umbrella, the `@shopify/*` libs, etc.).
 *
 * NOTE: the vendored `react-native-resource-calendar` ships pre-built
 * CJS in `dist/index.js` and is mocked outright in
 * `LandscapeWorkweekView.test.tsx` + `avatar-strip.test.tsx`, so it
 * doesn't need a transform entry. If a future spec ever imports it for
 * real, add `react-native-resource-calendar` to the allowlist below.
 */
module.exports = {
  preset: "jest-expo",

  // Runs BEFORE the test framework wires up — that's important because
  // several stores (`src/stores/calendar.ts`, `src/stores/auth.ts`,
  // etc.) import `@react-native-async-storage/async-storage` at the
  // module top level via the Zustand `persist` middleware. If the mock
  // isn't registered before the first `require()`, the native module
  // resolver throws "AsyncStorage is null".
  setupFiles: ["<rootDir>/jest-setup.js"],

  // Mirrors `tsconfig.json` `paths` so production-style imports
  // (`import x from "@/src/foo"`) resolve identically under Jest.
  // `@profit-model/*` lives under `vendor/profit-model/*` and is read
  // by tooling rather than tests, but we mirror it for parity.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@customer/(.*)$": "<rootDir>/src/modes/customer/$1",
    "^@technician/(.*)$": "<rootDir>/src/modes/technician/$1",
    "^@profit-model/(.*)$": "<rootDir>/vendor/profit-model/$1",
  },

  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@shopify/.*|react-native-reanimated|react-native-worklets|react-native-gesture-handler|@gorhom/.*)",
  ],

  // The repo doesn't use snapshot tests yet (master plan §3.10 leans
  // on executable-spec assertions instead). Disable snapshot
  // serializers' default chatter so failures stay easy to read.
  testEnvironment: "node",

  // Convenience: when running `npm test -- src/components/calendar`
  // we want jest to scope to that path; the default rootDir already
  // handles this correctly. Extra ignores keep us from picking up
  // `dist/` snapshots inside the vendored library or the build cache.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/.expo/",
    "/dist/",
    "/vendor/react-native-resource-calendar/",
  ],
};
