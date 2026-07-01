/**
 * Zod schemas for `AppointmentFormSheet` (P2-FE-1).
 *
 * Mirrors the field set previously held in `useState` 1:1 — see
 * `src/components/calendar/appointment-form-sheet.tsx`. No new fields
 * are introduced by the RHF migration; validation copy matches the
 * existing inline `Alert.alert` branches verbatim.
 *
 * Two schemas live here:
 *   1. `appointmentFormSchema(isEdit)` — the main sheet form. When
 *      editing, `customer` and `services` aren't presented in the UI
 *      and so are not required; when creating, both are required and
 *      use the same copy the previous `useState` branch surfaced.
 *   2. `quickCreateCustomerSchema` — the sub-form rendered inside
 *      the sheet for inline customer creation.
 */

import { z } from "zod";
import {
  CalendarNotificationPreference,
  SlotType,
} from "@technician/types/enums";
import type { CustomerSearchResult } from "@technician/types/calendar";

// `CustomerSearchResult` comes back from the API and is treated as
// an opaque selected value; the sheet only ever reads `id` /
// `first_name` / `last_name` from it. We don't re-validate the
// shape — `z.custom` lets us keep the prop-typed reference while
// still letting RHF treat it as a form value.
const customerValueSchema = z
  .custom<CustomerSearchResult | null>((v) => v === null || (typeof v === "object" && v !== null && "id" in v))
  .nullable();

const slotTypeSchema = z.enum([
  SlotType.STANDARD,
  SlotType.ECO,
  SlotType.PRIORITY,
  SlotType.FLEX_WINDOW,
]);

const notificationPreferenceSchema = z.enum([
  CalendarNotificationPreference.EMAIL_AND_TEXT,
  CalendarNotificationPreference.TEXT,
  CalendarNotificationPreference.EMAIL,
  CalendarNotificationPreference.NONE,
]);

// Loose YYYY-MM-DD pattern + HH:MM pattern. The existing sheet
// accepted any `BottomSheetTextInput` content for these fields and
// surfaced no validation error before submit; we keep that posture
// (no error message) but at least block obviously malformed values.
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^\d{2}:\d{2}$/;

/**
 * Build the appointment-form schema. The required-field rules differ
 * between create and edit modes, so the schema is a factory.
 */
export function appointmentFormSchema(isEdit: boolean) {
  return z.object({
    customer: isEdit
      ? customerValueSchema
      : customerValueSchema.refine((v) => v !== null, {
          message: "Please select a customer",
        }),
    services: isEdit
      ? z.array(z.number().int())
      : z
          .array(z.number().int())
          .min(1, { message: "Please select at least one service" }),
    date: z.string().regex(dateRegex, { message: "Use YYYY-MM-DD" }),
    startTime: z.string().regex(timeRegex, { message: "Use HH:MM" }),
    slotType: slotTypeSchema,
    notificationPreference: notificationPreferenceSchema,
    note: z.string(),
  });
}

export type AppointmentFormValues = z.infer<
  ReturnType<typeof appointmentFormSchema>
>;

/**
 * Inline "add new customer" sub-form. The legacy code surfaced two
 * Alert.alert messages — keep the same copy so behaviour is
 * indistinguishable.
 */
export const quickCreateCustomerSchema = z.object({
  firstName: z.string().trim().min(1, {
    message: "First and last name are required",
  }),
  lastName: z.string().trim().min(1, {
    message: "First and last name are required",
  }),
  phone: z.string().trim().min(1, {
    message: "Phone number is required",
  }),
  email: z.string().trim(),
});

export type QuickCreateCustomerValues = z.infer<typeof quickCreateCustomerSchema>;
