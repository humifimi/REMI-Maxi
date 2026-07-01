import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  Alert,
  TextInput,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSettings, useUpdateSettings } from "@technician/hooks/auth/use-settings";
import type { TechnicianSettings, FranchiseThemeColors } from "@technician/types/api";
import { haptic } from "@technician/hooks/utility/use-haptics";
import { SkeletonListScreen } from "@/src/components/shared/skeleton";
import { useSoundStore } from "@technician/stores/sound";
import { useThemeStore, DEFAULT_COLORS } from "@technician/stores/theme";
import { useAuthStore } from "@/src/stores/auth";
import {
  useCalendarStore,
  DEFAULT_DISPLAY_START_MINUTES,
  DEFAULT_DISPLAY_END_MINUTES,
  MIN_DISPLAY_RANGE_MINUTES,
} from "@technician/stores/calendar";
import { CalendarRangeRow } from "@technician/components/calendar/calendar-range-row";
import { confirmStrictMode } from "@technician/components/calendar/calendar-quick-settings-sheet";
import { formatRangeSummary } from "@technician/utils/time-format";
import { SOUND_ASSETS } from "@technician/constants/sounds";
import { useSoundSystem } from "@technician/hooks/utility/use-sound";
import type { SoundEventType } from "@technician/types/api";
// PR-UX-20: clean-intent suggestion toggles. Mirrors the
// `useAccessibilityStore.preferredHand` precedent — each toggle is a
// single-purpose Switch row backed by a persisted Zustand store.
import { useCleanIntentSettingsStore } from "@technician/stores/clean-intent-settings";
// Phase 2 Chunk 2.3 — FO-only CARFAX cadence toggle. Inline section
// (rather than a sub-screen) because the control is a single binary
// toggle; mirrors the existing density of the FO-gated section below.
import {
  useCarfaxSettings,
  useUpdateCarfaxCadence,
} from "@technician/hooks/franchise/use-carfax-settings";
import { CarfaxCadence } from "@technician/types/enums";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SETTINGS: TechnicianSettings = {
  notifications: {
    job_reminders: true,
    schedule_changes: true,
    fleet_alerts: true,
    message_notifications: true,
  },
  sounds: {
    notification_sound: true,
    haptic_feedback: true,
  },
  shift: {
    start_time: "07:00",
    end_time: "17:00",
    working_days: [1, 2, 3, 4, 5],
  },
  default_zone: null,
};

export default function SettingsScreen() {
  const router = useRouter();
  const { data: settings, isLoading, isError, error, refetch } = useSettings();
  const updateSettings = useUpdateSettings();
  const [local, setLocal] = useState<TechnicianSettings>(DEFAULT_SETTINGS);
  const user = useAuthStore((s) => s.user);
  const isFranchiseOwner = user?.role === "franchise_owner";

  const soundPrefs = useSoundStore((s) => s.preferences);
  const toggleSoundEvent = useSoundStore((s) => s.toggleEvent);
  const setMasterSound = useSoundStore((s) => s.setMasterEnabled);
  const { playSound } = useSoundSystem();

  const themeStore = useThemeStore();
  const resolvedTheme = themeStore.resolvedTheme();
  const [previewColors, setPreviewColors] = useState<Partial<FranchiseThemeColors>>({});

  const displayStartMinutes = useCalendarStore((s) => s.displayStartMinutes);
  const displayEndMinutes = useCalendarStore((s) => s.displayEndMinutes);
  const setDisplayRange = useCalendarStore((s) => s.setDisplayRange);
  const resetDisplayRange = useCalendarStore((s) => s.resetDisplayRange);
  const displayAutoExpand = useCalendarStore((s) => s.displayAutoExpand);
  const setDisplayAutoExpand = useCalendarStore((s) => s.setDisplayAutoExpand);

  // PR-UX-20 — Calendar suggestions toggles. The "Show clean-move
  // suggestions" toggle gates the auto-promote toast on the calendar
  // tab; the "Confirm before applying" toggle defers the toast's
  // Apply now to a confirmation alert. Both persist via the
  // `useCleanIntentSettingsStore` Zustand persist middleware.
  const showCleanMoveSuggestions = useCleanIntentSettingsStore(
    (s) => s.showCleanMoveSuggestions,
  );
  const setShowCleanMoveSuggestions = useCleanIntentSettingsStore(
    (s) => s.setShowCleanMoveSuggestions,
  );
  const confirmBeforeApplyingCleanMoves = useCleanIntentSettingsStore(
    (s) => s.confirmBeforeApplyingCleanMoves,
  );
  const setConfirmBeforeApplyingCleanMoves = useCleanIntentSettingsStore(
    (s) => s.setConfirmBeforeApplyingCleanMoves,
  );

  // Phase 2 Chunk 2.3 — CARFAX cadence (FO-only). Read the current
  // value from BE and expose a mutation that flips it. The hook is
  // gated by `isFranchiseOwner` via its `enabled` flag so non-FO users
  // don't trigger a guaranteed 403 fetch.
  const carfaxSettingsQuery = useCarfaxSettings({ enabled: isFranchiseOwner });
  const updateCarfaxCadence = useUpdateCarfaxCadence();

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const save = (patch: Partial<TechnicianSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    updateSettings.mutate(patch, {
      onError: () =>
        Alert.alert("Error", "Could not save settings. Try again."),
    });
  };

  const toggleNotification = (
    key: keyof TechnicianSettings["notifications"]
  ) => {
    haptic.light();
    save({
      notifications: {
        ...local.notifications,
        [key]: !local.notifications[key],
      },
    });
  };

  const toggleSound = (key: keyof TechnicianSettings["sounds"]) => {
    haptic.light();
    save({
      sounds: { ...local.sounds, [key]: !local.sounds[key] },
    });
  };

  const toggleDay = (day: number) => {
    haptic.light();
    const days = local.shift.working_days.includes(day)
      ? local.shift.working_days.filter((d) => d !== day)
      : [...local.shift.working_days, day].sort();
    save({ shift: { ...local.shift, working_days: days } });
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={SETTINGS_HEADER_OPTIONS(router)} />
        <SkeletonListScreen cards={4} />
      </>
    );
  }

  if (isError || !settings) {
    return (
      <>
        <Stack.Screen options={SETTINGS_HEADER_OPTIONS(router)} />
        <View style={styles.errorContainer}>
          <MaterialIcons name="cloud-off" size={48} color="#9CA3AF" />
          <Text style={styles.errorTitle}>Couldn&apos;t load settings</Text>
          <Text style={styles.errorBody}>
            {error instanceof Error
              ? error.message
              : "Check your connection and try again."}
          </Text>
          <Pressable
            style={styles.errorRetryBtn}
            onPress={() => {
              haptic.light();
              refetch();
            }}
            accessibilityRole="button"
            testID="settings-retry-btn"
          >
            <Text style={styles.errorRetryText}>Retry</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={SETTINGS_HEADER_OPTIONS(router)} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.card}>
          <SettingRow
            icon="notifications-active"
            label="Job Reminders"
            value={local.notifications.job_reminders}
            onToggle={() => toggleNotification("job_reminders")}
          />
          <SettingRow
            icon="calendar-today"
            label="Schedule Changes"
            value={local.notifications.schedule_changes}
            onToggle={() => toggleNotification("schedule_changes")}
          />
          <SettingRow
            icon="local-shipping"
            label="Fleet Alerts"
            value={local.notifications.fleet_alerts}
            onToggle={() => toggleNotification("fleet_alerts")}
          />
          <SettingRow
            icon="message"
            label="Messages"
            value={local.notifications.message_notifications}
            onToggle={() => toggleNotification("message_notifications")}
            isLast
          />
        </View>

        <Text style={styles.sectionHeader}>Sounds</Text>
        <View style={styles.card}>
          <SettingRow
            icon="volume-up"
            label="Notification Sound"
            value={local.sounds.notification_sound}
            onToggle={() => toggleSound("notification_sound")}
          />
          <SettingRow
            icon="vibration"
            label="Haptic Feedback"
            value={local.sounds.haptic_feedback}
            onToggle={() => toggleSound("haptic_feedback")}
            isLast
          />
        </View>

        <Text style={styles.sectionHeader}>Sound Events</Text>
        <View style={styles.card}>
          <SettingRow
            icon="volume-off"
            label="Master Sound"
            value={soundPrefs.master_enabled}
            onToggle={() => {
              haptic.light();
              setMasterSound(!soundPrefs.master_enabled);
            }}
          />
          {SOUND_ASSETS.map((asset, idx) => (
            <SoundEventRow
              key={asset.key}
              icon={asset.icon}
              label={asset.label}
              description={asset.description}
              enabled={soundPrefs.master_enabled && soundPrefs.events[asset.key]}
              disabled={!soundPrefs.master_enabled}
              onToggle={() => {
                haptic.light();
                toggleSoundEvent(asset.key);
              }}
              onPreview={() => playSound(asset.key)}
              isLast={idx === SOUND_ASSETS.length - 1}
            />
          ))}
        </View>

        {isFranchiseOwner && (
          <>
            <Text style={styles.sectionHeader}>Brand Theme</Text>
            <View style={styles.card}>
              <ThemeColorRow
                label="Primary"
                colorKey="primary"
                currentColor={resolvedTheme.colors.primary}
                isPreviewActive={themeStore.isPreviewActive}
                onColorChange={(color) => {
                  if (!themeStore.isPreviewActive) {
                    themeStore.startPreview({ ...resolvedTheme });
                  }
                  themeStore.updatePreview({ primary: color, tab_active: color, primary_light: color + "66" });
                }}
              />
              <View style={styles.divider} />
              <ThemeColorRow
                label="Header Background"
                colorKey="header_bg"
                currentColor={resolvedTheme.colors.header_bg}
                isPreviewActive={themeStore.isPreviewActive}
                onColorChange={(color) => {
                  if (!themeStore.isPreviewActive) {
                    themeStore.startPreview({ ...resolvedTheme });
                  }
                  themeStore.updatePreview({ header_bg: color, secondary: color });
                }}
              />
              <View style={styles.divider} />
              <ThemeColorRow
                label="Accent"
                colorKey="accent"
                currentColor={resolvedTheme.colors.accent}
                isPreviewActive={themeStore.isPreviewActive}
                onColorChange={(color) => {
                  if (!themeStore.isPreviewActive) {
                    themeStore.startPreview({ ...resolvedTheme });
                  }
                  themeStore.updatePreview({ accent: color });
                }}
              />
              {themeStore.isPreviewActive && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.themeActions}>
                    <Pressable
                      style={[styles.themeBtn, { backgroundColor: resolvedTheme.colors.primary }]}
                      onPress={() => {
                        haptic.medium();
                        themeStore.commitPreview();
                        Alert.alert("Theme Saved", "Brand colors have been applied.");
                      }}
                    >
                      <Text style={styles.themeBtnText}>Save Theme</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.themeBtn, styles.themeBtnCancel]}
                      onPress={() => {
                        haptic.light();
                        themeStore.cancelPreview();
                      }}
                    >
                      <Text style={[styles.themeBtnText, { color: "#6B7280" }]}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.themeBtn, styles.themeBtnCancel]}
                      onPress={() => {
                        haptic.light();
                        themeStore.resetToDefault();
                        Alert.alert("Reset", "Theme reset to REMI defaults.");
                      }}
                    >
                      <Text style={[styles.themeBtnText, { color: "#EF4444" }]}>Reset</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
            {themeStore.isPreviewActive && (
              <Text style={styles.previewHint}>
                Live preview active — colors update in real time across the app.
              </Text>
            )}

            {/* P7-FE-1: trust-gradient policy editor (FO-only).
                The route enforces the same FO check; this entry just
                hides the link from non-FO users so it never renders. */}
            <Text style={styles.sectionHeader}>Reorganization Policy</Text>
            <Pressable
              style={({ pressed }) => [
                styles.card,
                styles.policyLinkRow,
                pressed && styles.policyLinkRowPressed,
              ]}
              onPress={() => {
                haptic.light();
                router.push("/settings/reorganization-policy" as never);
              }}
              accessibilityRole="button"
              testID="settings-reorganization-policy-entry"
            >
              <View style={styles.policyLinkLabelGroup}>
                <Text style={styles.policyLinkTitle}>Trust gradient</Text>
                <Text style={styles.policyLinkSubtitle}>
                  Choose which reorganizations auto-commit and which queue for
                  your review.
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
            </Pressable>

            {/* Phase 2 Chunk 2.3: CARFAX cadence (FO-only).
                Single binary toggle — submit on every job vs. let the
                nightly batch cron sweep handle it. The cron from
                Chunk 2.2 runs at 02:00 local time regardless; this
                switch only changes whether the FE submission service
                fires synchronously on job complete. */}
            <Text style={styles.sectionHeader}>CARFAX Submissions</Text>
            <View style={styles.card}>
              {carfaxSettingsQuery.isLoading ? (
                <Text style={styles.carfaxHelper}>Loading…</Text>
              ) : carfaxSettingsQuery.isError ? (
                <Text style={styles.carfaxHelper}>
                  Could not load CARFAX settings. Pull to retry.
                </Text>
              ) : (
                <>
                  <View style={styles.carfaxRow}>
                    <View style={styles.carfaxLabelGroup}>
                      <Text style={styles.carfaxTitle}>
                        Submit on every job
                      </Text>
                      <Text style={styles.carfaxSubtitle}>
                        {carfaxSettingsQuery.data?.carfax_submission_cadence ===
                        CarfaxCadence.EVERY_JOB
                          ? "Reports go to CARFAX as soon as the job is complete."
                          : "Reports queue overnight and ship in a nightly batch at 2:00 AM local time."}
                      </Text>
                    </View>
                    <Switch
                      value={
                        carfaxSettingsQuery.data?.carfax_submission_cadence ===
                        CarfaxCadence.EVERY_JOB
                      }
                      onValueChange={(nextOn) => {
                        haptic.light();
                        updateCarfaxCadence.mutate(
                          nextOn
                            ? CarfaxCadence.EVERY_JOB
                            : CarfaxCadence.NIGHTLY_BATCH,
                          {
                            onError: () =>
                              Alert.alert(
                                "Error",
                                "Could not update CARFAX cadence. Try again.",
                              ),
                          },
                        );
                      }}
                      disabled={updateCarfaxCadence.isPending}
                      testID="settings-carfax-cadence-toggle"
                    />
                  </View>
                  {carfaxSettingsQuery.data?.carfax_location_id ? (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.carfaxHelper}>
                        QuickVIN Plus Location ID:{" "}
                        {carfaxSettingsQuery.data.carfax_location_id}
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.carfaxHelper}>
                        QuickVIN Plus is not wired up for this franchise yet.
                        Submissions will fail until an integration admin
                        configures a location ID.
                      </Text>
                    </>
                  )}
                </>
              )}
            </View>
          </>
        )}

        {/* PR-UX-20: Calendar suggestions section — auto-promote toast
            controls. Mounted above the Calendar Display Hours section
            so the toggles sit alongside the other calendar prefs the
            user is most likely tweaking together. */}
        <Text style={styles.sectionHeader}>Calendar Suggestions</Text>
        <View style={styles.card}>
          <CleanIntentToggleRow
            icon="auto-awesome"
            label="Show clean-move suggestions"
            description="Auto-promote a calendar toast when a staged change has no conflicts"
            value={showCleanMoveSuggestions}
            onToggle={() => {
              haptic.light();
              setShowCleanMoveSuggestions(!showCleanMoveSuggestions);
            }}
            testID="settings-show-clean-move-suggestions"
          />
          <View style={styles.divider} />
          <CleanIntentToggleRow
            icon="check-circle"
            label="Confirm before applying clean moves"
            description="Show an extra confirmation when tapping Apply now on a clean-move toast"
            value={confirmBeforeApplyingCleanMoves}
            onToggle={() => {
              haptic.light();
              setConfirmBeforeApplyingCleanMoves(
                !confirmBeforeApplyingCleanMoves,
              );
            }}
            testID="settings-confirm-clean-move-apply"
            isLast
          />
        </View>

        <Text style={styles.sectionHeader}>Calendar Display Hours</Text>
        <View style={styles.card}>
          <CalendarRangeRow
            label="Day Starts"
            minutes={displayStartMinutes}
            minBound={0}
            maxBound={displayEndMinutes - MIN_DISPLAY_RANGE_MINUTES}
            onChange={(next) => {
              haptic.light();
              setDisplayRange(next, displayEndMinutes);
              if (displayAutoExpand) setDisplayAutoExpand(false);
            }}
          />
          <View style={styles.divider} />
          <CalendarRangeRow
            label="Day Ends"
            minutes={displayEndMinutes}
            minBound={displayStartMinutes + MIN_DISPLAY_RANGE_MINUTES}
            maxBound={1440}
            onChange={(next) => {
              haptic.light();
              setDisplayRange(displayStartMinutes, next);
              if (displayAutoExpand) setDisplayAutoExpand(false);
            }}
          />
          <View style={styles.divider} />
          <View style={styles.calendarRangeFooter}>
            <Text style={styles.calendarRangeFooterText}>
              {formatRangeSummary(displayStartMinutes, displayEndMinutes)}
            </Text>
            {(displayStartMinutes !== DEFAULT_DISPLAY_START_MINUTES ||
              displayEndMinutes !== DEFAULT_DISPLAY_END_MINUTES) && (
              <Pressable
                onPress={() => {
                  haptic.light();
                  resetDisplayRange();
                }}
                hitSlop={8}
              >
                <Text style={styles.calendarRangeReset}>Reset</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.settingLabel}>Fit to events</Text>
              <Text style={styles.autoExpandSub}>
                Cap the calendar to your first and last event each day
              </Text>
            </View>
            <Switch
              value={displayAutoExpand}
              onValueChange={(next) => {
                haptic.light();
                if (!next) {
                  confirmStrictMode(() => setDisplayAutoExpand(false));
                } else {
                  setDisplayAutoExpand(true);
                }
              }}
              trackColor={{ false: "#D1D5DB", true: "#3B82F6" }}
            />
          </View>
          <View style={styles.divider} />
          {displayAutoExpand ? (
            <View style={styles.calendarRangeNote}>
              <MaterialIcons name="info-outline" size={16} color="#6B7280" />
              <Text style={styles.calendarRangeNoteText}>
                Calendar fits exactly to your events. Falls back to the bounds above on empty days. Adjusting the bounds switches off Fit to events.
              </Text>
            </View>
          ) : (
            <View style={styles.strictWarning}>
              <MaterialIcons name="warning-amber" size={16} color="#B45309" />
              <Text style={styles.strictWarningText}>
                Strict mode is on. Events that start before Day Starts or end after Day Ends will be hidden or clipped at the edge of the grid.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionHeader}>Shift / Availability</Text>
        <View style={styles.card}>
          <CalendarRangeRow
            label="Start"
            minutes={parseShiftTime(local.shift.start_time)}
            minBound={0}
            maxBound={parseShiftTime(local.shift.end_time) - SHIFT_MIN_WINDOW_MINUTES}
            onChange={(next) => {
              haptic.light();
              save({
                shift: { ...local.shift, start_time: formatShiftTime(next) },
              });
            }}
          />
          <View style={styles.divider} />
          <CalendarRangeRow
            label="End"
            minutes={parseShiftTime(local.shift.end_time)}
            minBound={parseShiftTime(local.shift.start_time) + SHIFT_MIN_WINDOW_MINUTES}
            maxBound={1440}
            onChange={(next) => {
              haptic.light();
              save({
                shift: { ...local.shift, end_time: formatShiftTime(next) },
              });
            }}
          />
          <View style={styles.divider} />
          <View style={styles.daysRow}>
            {DAYS.map((label, idx) => {
              const active = local.shift.working_days.includes(idx);
              return (
                <Pressable
                  key={idx}
                  style={[styles.dayBtn, active && styles.dayBtnActive]}
                  onPress={() => toggleDay(idx)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      active && styles.dayTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionHeader}>Zone</Text>
        <View style={styles.card}>
          <View style={styles.zoneRow}>
            <MaterialIcons name="map" size={20} color="#6B7280" />
            <Text style={styles.zoneText}>
              {local.default_zone ?? "Not assigned"}
            </Text>
          </View>
        </View>

        {/* 2026-05-25 — Field Test Tools moved to the More tab to
            keep them next to the Demo Mode panel (the two are
            mutually-exclusive analogs — Demo Mode for demo users,
            Field Test Tools for the `@maxi-mobile.com` identity).
            See `app/(tabs)/more.tsx`. */}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const SHIFT_MIN_WINDOW_MINUTES = 30;

function SETTINGS_HEADER_OPTIONS(
  router: ReturnType<typeof useRouter>
): React.ComponentProps<typeof Stack.Screen>["options"] {
  return {
    headerShown: true,
    title: "Settings",
    headerStyle: { backgroundColor: "#111827" },
    headerTintColor: "#fff",
    headerTitleStyle: { fontWeight: "700" },
    headerLeft: () => (
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <MaterialIcons name="arrow-back" size={24} color="#fff" />
      </Pressable>
    ),
  };
}

function parseShiftTime(value: string): number {
  const [h, m] = value.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return Math.max(0, Math.min(1440, h * 60 + m));
}

function formatShiftTime(minutes: number): string {
  const total = Math.max(0, Math.min(1440, Math.round(minutes)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// CalendarRangeRow + formatTimeOfDay/formatRangeSummary moved to
// `src/components/calendar/calendar-range-row.tsx` and
// `src/utils/time-format.ts` so the in-calendar Quick Settings sheet
// can reuse the same controls.

function SettingRow({
  icon,
  label,
  value,
  onToggle,
  isLast,
}: {
  icon: string;
  label: string;
  value: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <>
      <View style={styles.settingRow}>
        <MaterialIcons name={icon as any} size={20} color="#6B7280" />
        <Text style={styles.settingLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
          thumbColor={value ? "#3B82F6" : "#F3F4F6"}
        />
      </View>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

/**
 * PR-UX-20 — Toggle row for the Calendar Suggestions section.
 *
 * Variant of `SettingRow` that surfaces a description line under the
 * label, which the existing `SettingRow` doesn't (it sits in cards
 * with iconographic-only labels). Mirrors the `ToggleRow` pattern in
 * `app/help/report-settings.tsx` but stays inline here so settings
 * UI stays self-contained.
 */
function CleanIntentToggleRow({
  icon,
  label,
  description,
  value,
  onToggle,
  isLast,
  testID,
}: {
  icon: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  isLast?: boolean;
  testID?: string;
}) {
  return (
    <>
      <View style={[styles.settingRow, { alignItems: "flex-start", paddingVertical: 12 }]}>
        <MaterialIcons name={icon as any} size={20} color="#6B7280" style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.soundDesc}>{description}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
          thumbColor={value ? "#3B82F6" : "#F3F4F6"}
          testID={testID}
        />
      </View>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

function SoundEventRow({
  icon,
  label,
  description,
  enabled,
  disabled,
  onToggle,
  onPreview,
  isLast,
}: {
  icon: string;
  label: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
  onPreview: () => void;
  isLast?: boolean;
}) {
  return (
    <>
      <View style={styles.divider} />
      <View style={[styles.settingRow, { alignItems: "flex-start", paddingVertical: 12 }]}>
        <MaterialIcons
          name={icon as any}
          size={20}
          color={disabled ? "#D1D5DB" : "#6B7280"}
          style={{ marginTop: 2 }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.settingLabel, disabled && { color: "#9CA3AF" }]}>{label}</Text>
          <Text style={styles.soundDesc}>{description}</Text>
        </View>
        <Pressable
          onPress={onPreview}
          hitSlop={8}
          style={styles.previewBtn}
          disabled={!enabled}
        >
          <MaterialIcons
            name="play-arrow"
            size={18}
            color={enabled ? "#3B82F6" : "#D1D5DB"}
          />
        </Pressable>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
          thumbColor={enabled ? "#3B82F6" : "#F3F4F6"}
          disabled={disabled}
        />
      </View>
    </>
  );
}

function ThemeColorRow({
  label,
  colorKey,
  currentColor,
  isPreviewActive,
  onColorChange,
}: {
  label: string;
  colorKey: string;
  currentColor: string;
  isPreviewActive: boolean;
  onColorChange: (color: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentColor);

  useEffect(() => {
    setInputValue(currentColor);
  }, [currentColor]);

  const applyColor = useCallback(() => {
    const hex = inputValue.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onColorChange(hex);
      setEditing(false);
    } else {
      Alert.alert("Invalid Color", "Enter a valid 6-digit hex color (e.g. #3B82F6)");
    }
  }, [inputValue, onColorChange]);

  return (
    <View style={styles.themeRow}>
      <View
        style={[styles.colorSwatch, { backgroundColor: currentColor }]}
      />
      <Text style={styles.settingLabel}>{label}</Text>
      {editing ? (
        <View style={styles.colorInputWrap}>
          <TextInput
            style={styles.colorInput}
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={applyColor}
            maxLength={7}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="#3B82F6"
            placeholderTextColor="#9CA3AF"
          />
          <Pressable onPress={applyColor} hitSlop={8}>
            <MaterialIcons name="check" size={20} color="#22C55E" />
          </Pressable>
          <Pressable onPress={() => { setEditing(false); setInputValue(currentColor); }} hitSlop={8}>
            <MaterialIcons name="close" size={20} color="#EF4444" />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setEditing(true)} hitSlop={8}>
          <Text style={styles.colorHex}>{currentColor}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  errorContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  errorBody: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  errorRetryBtn: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#3B82F6",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  errorRetryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 48,
  },
  calendarRangeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  calendarRangeFooterText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  calendarRangeReset: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
  calendarRangeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F9FAFB",
  },
  autoExpandSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },
  strictWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FFFBEB",
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
  },
  strictWarningText: {
    flex: 1,
    fontSize: 12,
    color: "#92400E",
    lineHeight: 16,
    fontWeight: "500",
  },
  calendarRangeNoteText: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  dayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  dayBtnActive: { backgroundColor: "#3B82F6" },
  dayText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  dayTextActive: { color: "#fff" },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  zoneText: { fontSize: 15, color: "#6B7280" },
  soundDesc: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 16,
  },
  previewBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  themeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  colorHex: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "monospace",
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  colorInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorInput: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "monospace",
    color: "#111827",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    width: 90,
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  themeActions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  themeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  themeBtnCancel: {
    backgroundColor: "#F3F4F6",
  },
  themeBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  previewHint: {
    fontSize: 12,
    color: "#3B82F6",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  policyLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  policyLinkRowPressed: {
    opacity: 0.85,
  },
  policyLinkLabelGroup: {
    flex: 1,
    gap: 4,
  },
  policyLinkTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  policyLinkSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  carfaxRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  carfaxLabelGroup: {
    flex: 1,
    gap: 2,
  },
  carfaxTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  carfaxSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  carfaxHelper: {
    fontSize: 12,
    color: "#9CA3AF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    lineHeight: 16,
  },
});
