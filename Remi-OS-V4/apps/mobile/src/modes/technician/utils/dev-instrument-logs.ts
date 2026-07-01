/**
 * `dev-instrument-logs` — DEV-only side-effect module that prepends a
 * short, per-device tag to every `console.log/info/warn/error/debug`
 * call so logs captured from multiple devices in parallel (e.g. an
 * iOS simulator AND a physical iPhone on the same network) can be
 * disambiguated at a glance.
 *
 * Origin (2026-04-27): the user reported that they were debugging
 * cross-device sync issues by capturing Metro logs from a simulator
 * and a physical device simultaneously, and asked for log identifiers
 * so they could tell which device produced which line. Without this
 * patch the lines arrive interleaved with no attribution.
 *
 * Why monkey-patch instead of a `devLog(...)` helper:
 *
 *   The codebase already has hundreds of bare `console.log(...)` and
 *   `if (__DEV__) console.log(...)` call sites — wrapping every one
 *   would touch dozens of files and miss any new call site added
 *   later (or any log inside vendored libraries). Patching `console`
 *   once at app startup gets every existing call site for free, and
 *   any future call site picks up the prefix automatically with no
 *   opt-in needed. Same rationale and same install-once-idempotent
 *   pattern as `dev-instrument-popups.ts`, which has been stable
 *   since smart-default work landed.
 *
 * The patch is install-once-and-idempotent — re-importing this
 * module (e.g. on a Fast Refresh re-evaluation of `_layout.tsx`)
 * does NOT double-prefix, because we stamp each patched method with
 * `__remiDevPatched` and short-circuit on subsequent runs.
 *
 * Stripped from production bundles by the `__DEV__` guard at the
 * bottom — the module body is a no-op outside dev builds.
 *
 * Tag shape examples:
 *
 *   [iPhone17ProMax:a3f] [AUTH HYDRATE] { ... }
 *   [JacesiPhone:b1c] [DEBUG:Alert] shown { ... }
 *
 * The 3-hex-char suffix is a per-session random tiebreaker. It exists
 * because `expo-device` collides on names in Expo Go on iOS: the
 * simulator and a physical device can BOTH report
 * `Device.modelName === "iPhone 15 Pro"` regardless of the simulator
 * profile actually selected, because Expo Go's native binary was
 * built against specific hardware constants and reports those
 * instead of the simulated profile. The random suffix guarantees
 * tags are always distinct across the two devices in a session,
 * even when expo-device's name fields collide. The full device
 * fingerprint (deviceName, modelName, modelId, isDevice, osVersion)
 * is logged once at install time so the user can correlate a
 * suffix to the device's semantic identity.
 *
 * `Device.deviceName` is preferred over `Device.modelName` because
 * on iOS simulator in Expo Go, `Device.deviceName` returns the
 * simulator profile name (e.g. "iPhone 17 Pro Max") correctly,
 * while `Device.modelName` returns a hardcoded value. On physical
 * devices, `Device.deviceName` returns the user-set name from
 * Settings (e.g. "Jace's iPhone"), which is also reliable.
 *
 * Stripped from production bundles by the `__DEV__` guard at the
 * bottom — the module body is a no-op outside dev builds.
 *
 * Note on hot reload: this module's import in `app/_layout.tsx`
 * only runs at full app boot, not on incremental Fast Refresh.
 * Devices that were running BEFORE this module landed will not
 * have the patch installed even after a hot reload — they need a
 * full app reload (Cmd+R in simulator, or shake → Reload, or
 * `r r` in Metro) to pick up the patch.
 */

import * as Device from "expo-device";

type ConsoleMethodName = "log" | "info" | "warn" | "error" | "debug";

type ConsoleMethod = (...args: unknown[]) => void;

interface PatchedConsoleMethod extends ConsoleMethod {
  /** Marker so we don't double-wrap on Fast Refresh. */
  __remiDevPatched?: true;
  /** Reference to the original method for tests / fallthroughs. */
  __remiDevOriginal?: ConsoleMethod;
}

const PATCHED_METHODS: ConsoleMethodName[] = [
  "log",
  "info",
  "warn",
  "error",
  "debug",
];

interface DeviceTag {
  /** Short prefix attached to every patched console call. */
  compact: string;
  /** Full device fingerprint, logged once at install time. */
  fingerprint: Record<string, unknown>;
}

/**
 * Compute the device tag once at module load. `expo-device` exposes
 * its fields as synchronous constants (no `await` needed), so the
 * tag is stable for the lifetime of the JS bundle.
 *
 * The compact tag is `[name:suffix]`:
 *   - `name`  — `Device.deviceName` (iOS simulator profile name on
 *               sim, user-set device name on physical), squashed and
 *               truncated to 16 chars
 *   - `suffix` — 3 random hex chars, stable for the JS engine's
 *                lifetime; guaranteed-different across two devices
 *                in the same Metro session even if names collide
 */
function computeDeviceTag(): DeviceTag {
  const rawName =
    Device.deviceName ?? Device.modelName ?? "device";
  const name =
    rawName.replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "device";
  // 3 hex chars = 4096 possible suffixes, more than enough to
  // disambiguate the 2-3 dev devices a typical Metro session sees
  // even when `Device.deviceName` collides on them.
  const suffix = Math.floor(Math.random() * 0x1000)
    .toString(16)
    .padStart(3, "0");
  return {
    compact: `[${name}:${suffix}]`,
    fingerprint: {
      suffix,
      deviceName: Device.deviceName ?? null,
      modelName: Device.modelName ?? null,
      modelId: Device.modelId ?? null,
      isDevice: Device.isDevice,
      osName: Device.osName ?? null,
      osVersion: Device.osVersion ?? null,
    },
  };
}

const TAG = computeDeviceTag();
const DEVICE_TAG = TAG.compact;

/**
 * Exported so non-console call sites (e.g. structured telemetry,
 * future bug-report payloads) can surface the same identifier
 * without re-querying `expo-device`. Read-only — do not reassign.
 */
export function getDeviceTag(): string {
  return DEVICE_TAG;
}

function installLogPrefixer(): void {
  for (const method of PATCHED_METHODS) {
    const original = console[method] as PatchedConsoleMethod | undefined;
    if (!original || original.__remiDevPatched) continue;

    const patched: PatchedConsoleMethod = ((...args: unknown[]) => {
      // Prepending as a separate argument (rather than concatenating
      // into the first arg) keeps the inspector / Metro pretty-print
      // intact for object args — `console.log("[tag]", obj)` renders
      // the object as an expandable tree, while
      // `console.log("[tag] " + JSON.stringify(obj))` renders a flat
      // string. The first form is materially easier to read in
      // long-running sessions.
      original(DEVICE_TAG, ...args);
    }) as PatchedConsoleMethod;

    patched.__remiDevPatched = true;
    patched.__remiDevOriginal = original;

    // `console`'s methods are writable / configurable in both Hermes
    // and JSC; assigning back is safe.
    (console as unknown as Record<string, ConsoleMethod>)[method] = patched;
  }
}

if (__DEV__) {
  installLogPrefixer();
  // Self-announce on install. The compact tag (which prefixes this
  // very line via the patched console.log) maps to the full device
  // fingerprint dumped here so the user can correlate `[name:abc]`
  // tags in subsequent log lines to a specific device's
  // (deviceName, modelName, modelId, isDevice, osName, osVersion)
  // even when expo-device's name fields collide in Expo Go.
  // Single line, fires once per app boot thanks to the install-once
  // guard above.
  console.log("[dev-instrument-logs] installed →", TAG.fingerprint);
}
