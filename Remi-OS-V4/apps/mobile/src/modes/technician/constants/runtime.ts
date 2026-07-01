import Constants from "expo-constants";

export const IS_EXPO_GO = Constants.appOwnership === "expo";

/**
 * Temporary crash-isolation switch for Expo Go.
 * Set this to false to re-enable full native feature behavior in Expo Go.
 */
export const EXPO_GO_STABILITY_GUARDS_ENABLED = true;

/**
 * Single flag used by all Expo Go guard rails.
 */
export const EXPO_GO_GUARDS_ACTIVE =
  IS_EXPO_GO && EXPO_GO_STABILITY_GUARDS_ENABLED;

/**
 * Global flag to pause background view capture (rolling buffer, session recording)
 * while a native camera controller is presented. captureRef crashes when called
 * while UIImagePickerController is on top of the React view hierarchy.
 *
 * Set true BEFORE launching camera, false AFTER camera returns.
 */
let _nativeCameraActive = false;
export const NativeCamera = {
  get isActive() { return _nativeCameraActive; },
  acquire() { _nativeCameraActive = true; },
  release() { _nativeCameraActive = false; },
};

/**
 * Hard kill-switch for the bug-reporter rolling buffer + session recording.
 *
 * Background — 2026-04-18 incident:
 * On iOS 26.4.1 / iPhone 16 Pro, `react-native-view-shot`'s `captureRef`
 * (which uses `-[UIView drawViewHierarchyInRect:afterScreenUpdates:]`)
 * faults inside Apple's vImage color-conversion routine
 * (`vTransformTRCParametric_Planar16Q12_vec`) when the view tree contains
 * the Profit Calculator screen — likely the SVG charts or wide-color
 * content. The fault throws an uncaught NSException on the main thread,
 * Expo's errorRecoveryQueue catches it and `abort()` terminates the process.
 * No JS-side ErrorBoundary can catch it because the crash is in Apple's
 * Accelerate.framework, below the React Native bridge.
 *
 * Triggered by the rolling buffer's 3 FPS `setInterval` + `captureRef` loop
 * mounted at the app root, so it eventually crashes anything that renders
 * the offending view tree even if the user never opens the bug reporter.
 *
 * Until we have a safer capture path (e.g. UIGraphicsImageRenderer with an
 * sRGB context, or a per-route opt-out, or an updated view-shot release that
 * handles iOS 26 wide-color), the rolling buffer and on-demand session
 * recording are disabled. Other bug-report features (one-shot screenshot,
 * voice memo, text description, queueing) still work.
 *
 * Flip to `false` to re-enable the capture loop when the underlying issue
 * is resolved.
 */
export const BUG_REPORT_CAPTURE_DISABLED = true;
