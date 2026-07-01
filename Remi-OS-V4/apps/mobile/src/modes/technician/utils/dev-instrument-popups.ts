/**
 * `dev-instrument-popups` — DEV-only side-effect module that monkey-
 * patches `Alert.alert(...)` so every native dialog logs its title,
 * body, and button list when shown, plus which button the user tapped
 * (intercepting each button's `onPress`).
 *
 * Why monkey-patch instead of wrapping every call site:
 *
 *   The codebase has dozens of `Alert.alert(...)` invocations spread
 *   across screens, hooks, and mutation `onError` handlers (Approve
 *   AI, Cancel session, Remove intent, Couldn't finalize, etc.). A
 *   wrapper helper would require touching all of them and would miss
 *   any new alert added later. Patching `Alert.alert` once at app
 *   startup gets every existing call site for free, including alerts
 *   inside vendored libraries, and any future call site picks up the
 *   logging automatically with no opt-in needed.
 *
 *   The patch is install-once-and-idempotent — re-importing this
 *   module (e.g. on a Fast Refresh re-evaluation of `_layout.tsx`)
 *   does NOT double-wrap, because we stamp the patched function with
 *   `__remiDevPatched` and short-circuit on subsequent runs.
 *
 * Stripped from production bundles by the `__DEV__` guard at the
 * bottom — the module body is a no-op outside dev builds.
 *
 * Logged shape:
 *
 *   [DEBUG:Alert] shown
 *     { id, title, message, buttons: [{ text, style }, ...] }
 *
 *   [DEBUG:Alert] tap → "<button text>"
 *     { id, buttonIndex, buttonStyle }
 *
 *   [DEBUG:Alert] dismissed (Android cancelable / OS back button)
 *     { id }
 *
 * Each open alert gets a monotonic `id` so the "shown" line and the
 * "tap" / "dismissed" line that follows can be correlated when
 * multiple alerts fire in quick succession.
 */

import { Alert, type AlertButton, type AlertOptions } from "react-native";

type AlertAlertSignature = (typeof Alert)["alert"];

interface PatchedAlert extends AlertAlertSignature {
  /** Marker so we don't double-wrap on Fast Refresh. */
  __remiDevPatched?: true;
  /** Reference to the original `Alert.alert` so a future helper or
   *  test can call through the patch if needed. */
  __remiDevOriginal?: AlertAlertSignature;
}

let alertIdCounter = 0;

function installAlertLogger(): void {
  const original = Alert.alert as PatchedAlert;
  if (original.__remiDevPatched) return;

  const patched: PatchedAlert = ((
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => {
    const id = ++alertIdCounter;
    const buttonSummary = (buttons ?? [{ text: "OK" }]).map((b) => ({
      text: b.text ?? "(default)",
      style: b.style ?? "default",
    }));
    console.log("[DEBUG:Alert] shown", {
      id,
      title,
      message: message ?? null,
      buttons: buttonSummary,
    });

    const wrappedButtons: AlertButton[] | undefined = buttons?.map(
      (btn, idx) => ({
        ...btn,
        onPress: (value?: string) => {
          console.log(`[DEBUG:Alert] tap → "${btn.text ?? "(default)"}"`, {
            id,
            buttonIndex: idx,
            buttonStyle: btn.style ?? "default",
            promptValue: typeof value === "string" ? value : undefined,
          });
          // RN typings allow either signature on the button onPress;
          // the cast keeps this generic over both prompt and alert
          // forms without forcing callers to widen their types.
          (btn.onPress as ((v?: string) => void) | undefined)?.(value);
        },
      }),
    );

    // Wrap onDismiss too — Android-only OS back-button dismiss path.
    const wrappedOptions: AlertOptions | undefined = options
      ? {
          ...options,
          onDismiss: () => {
            console.log("[DEBUG:Alert] dismissed (cancelable / back)", { id });
            options.onDismiss?.();
          },
        }
      : options;

    return original(title, message, wrappedButtons, wrappedOptions);
  }) as PatchedAlert;

  patched.__remiDevPatched = true;
  patched.__remiDevOriginal = original;

  // RN exposes `Alert.alert` as a static property; assigning back is
  // safe because the property descriptor is writable.
  (Alert as unknown as { alert: PatchedAlert }).alert = patched;
}

if (__DEV__) {
  installAlertLogger();
}
