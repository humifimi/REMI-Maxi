/**
 * Global Jest setup for REMITechnician.
 *
 * Wired in via `setupFiles` in `jest.config.js` so it runs before
 * Zustand stores' top-level `import AsyncStorage from "..."` resolves.
 * If we used `setupFilesAfterEach` instead the store import would fire
 * before the mock was registered and we'd get the
 * "NativeModule: AsyncStorage is null" error.
 *
 * Add additional global mocks here (NetInfo, expo-haptics, etc.) only
 * if a specific test needs them and an inline `jest.mock(...)` would
 * be repetitive.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// `react-native-safe-area-context` ships its own Jest mock that returns
// zero insets and a no-op provider. Required because every screen
// (including LandscapeWorkweekView) calls `useSafeAreaInsets()` at
// the top of its render — without the provider mounted in tests it
// throws "No safe area value available".
//
// Tests that care about non-zero insets pass a
// `safeAreaInsetsOverride={...}` prop directly (see
// `LandscapeWorkweekView`'s test surface) which bypasses this mock
// entirely, so the always-zero default is fine.
// The shipped mock is a `export default { ... }` bag; spread it onto
// the module namespace so consumer-side `import { useSafeAreaInsets }`
// resolves correctly.
jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock").default;
  return { __esModule: true, ...mock };
});

// `@shopify/react-native-skia` runs a JSI-binding install at module
// load time (`NativeSetup.ts`) that throws "Native Skia Module failed
// to correctly install JSI Bindings" outside a real RN runtime. The
// vendored `react-native-resource-calendar` imports Skia at the top
// of `dist/index.js` for its grid renderer, so any test file that
// imports anything from the library transitively triggers the throw.
//
// Real Skia rendering is irrelevant for unit tests (we either mock
// the Calendar component outright in component-level specs, or pull
// in a single pure helper like `resolveLandedResourceId`), so a
// minimal stub is enough. Keep this surface small — if a future spec
// actually exercises Skia behavior, tighten the stub at the call
// site rather than expanding this default.
jest.mock("@shopify/react-native-skia", () => {
  const noop = () => null;
  return {
    __esModule: true,
    Canvas: noop,
    Group: noop,
    Path: noop,
    Skia: { Path: { Make: () => ({ moveTo: noop, lineTo: noop, close: noop }) } },
    useFont: () => null,
    useImage: () => null,
  };
});
