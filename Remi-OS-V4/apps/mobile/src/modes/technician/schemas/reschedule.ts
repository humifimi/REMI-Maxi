/**
 * Zod schema for `RescheduleSheet` (P2-FE-1).
 *
 * Mirrors the field set previously held in `useState` 1:1 — see
 * `src/components/calendar/reschedule-sheet.tsx`. The pre-RHF version
 * had no field-level validation (the sole guard was a missing-
 * appointment Alert, which is now a `formState`-independent early
 * return on the prop). Schema is permissive on purpose to match
 * prior behaviour exactly.
 */

import dayjs, { type Dayjs } from "dayjs";
import { z } from "zod";
import { CalendarNotificationPreference } from "@technician/types/enums";

const notificationPreferenceSchema = z.enum([
  CalendarNotificationPreference.EMAIL_AND_TEXT,
  CalendarNotificationPreference.TEXT,
  CalendarNotificationPreference.EMAIL,
  CalendarNotificationPreference.NONE,
]);

// `selectedDate` is held as a Dayjs in the legacy sheet so all the
// stepper handlers can call `.add(...)` directly. We keep that exact
// shape so the migration is field-set-equivalent — RHF accepts any
// value type as long as the schema validates it.
const dayjsSchema = z.custom<Dayjs>(
  (v) => dayjs.isDayjs(v) && (v as Dayjs).isValid(),
  { message: "Pick a valid date and time" },
);

export const rescheduleSchema = z.object({
  selectedDate: dayjsSchema,
  durationMin: z.number().int().positive(),
  notificationPreference: notificationPreferenceSchema,
  customMessage: z.string(),
});

export type RescheduleFormValues = z.infer<typeof rescheduleSchema>;
