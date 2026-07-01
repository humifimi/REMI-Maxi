// 2026-05-13 — keeps Sentry's process-wide tags + user identity
// in sync with the app's primary state stores so every captured
// event (errors, replays, the move-outcome events from the
// `useSessionAwareSubmit` instrumentation) is filterable by the
// most useful axes without us having to thread context through
// every call site.
//
// Renders nothing. Mount once near the root of the tree, AFTER
// `Sentry.init()` has run and AFTER the auth/calendar/demo
// stores have rehydrated.
//
// Tags wired:
//   - `app.role` (technician / franchise_owner) — from auth store
//   - `app.view_mode` (day / week / month) — from calendar store
//   - `app.linter_strictness` (strict / loose) — from demo store
//   - `user` (Sentry's first-class identity field) — from auth store
//
// Why a dedicated component instead of a `useEffect` inline in
// `_layout.tsx`: the root layout is already very dense, and tag
// sync is independent enough that one small file dedicated to it
// makes the dependency graph easier to reason about. Easy to add
// more tags here later (active session id, build channel, etc.)
// without bloating the layout.

import { useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import * as Updates from "expo-updates";

import { useAuthStore } from "@/src/stores/auth";
import { useCalendarStore } from "@technician/stores/calendar";
import { useDemoSettingsStore } from "@technician/stores/demo-settings";
import { setGlobalSentryTags } from "@technician/utils/sentry-diagnostics";

/**
 * 2026-05-13 — OTA bundle id (the JS bundle hash currently
 * running on device, as published by `eas update`). Distinct from
 * the Sentry `release` tag, which reflects the NATIVE binary
 * version (`com.remiservice.technician@2.4.1+15`). Two devices on
 * the same native binary can be on different OTA bundles; this
 * tag lets us filter Sentry events to the exact JS bundle.
 *
 * When the app is running an embedded bundle (no OTA has applied
 * yet), `Updates.updateId` is `null` per the expo-updates API.
 * We surface that as the literal string "embedded" so the tag
 * remains queryable.
 */
function computeOtaTag(): string {
  const updateId = Updates.updateId;
  if (typeof updateId === "string" && updateId.length > 0) {
    return updateId;
  }
  return "embedded";
}

export function SentryTagSync(): null {
  const user = useAuthStore((s) => s.user);
  const viewMode = useCalendarStore((s) => s.viewMode);
  const linterStrictness = useDemoSettingsStore((s) => s.linterStrictness);

  // OTA bundle id — set ONCE at first mount. The value cannot change
  // mid-session because `Updates.updateId` is captured at app launch.
  useEffect(() => {
    const otaId = computeOtaTag();
    Sentry.setTag("app.ota_update_id", otaId);
    // Short form (first 8 chars) for at-a-glance correlation with the
    // copy-paste id the user reads off their device.
    Sentry.setTag("app.ota_short", otaId.slice(0, 8));
    // Channel reflects which EAS Update channel served this bundle
    // (preview vs production). Useful for filtering when both
    // channels are active.
    const channel = Updates.channel;
    Sentry.setTag(
      "app.ota_channel",
      typeof channel === "string" && channel.length > 0 ? channel : "embedded",
    );
  }, []);

  useEffect(() => {
    if (user) {
      Sentry.setUser({
        id: String(user.userId),
        email: user.email,
        username: user.fullName,
      });
      setGlobalSentryTags({ role: user.role });
    } else {
      Sentry.setUser(null);
      setGlobalSentryTags({ role: null });
    }
  }, [user]);

  useEffect(() => {
    setGlobalSentryTags({ viewMode });
  }, [viewMode]);

  useEffect(() => {
    setGlobalSentryTags({ linterStrictness });
  }, [linterStrictness]);

  return null;
}
