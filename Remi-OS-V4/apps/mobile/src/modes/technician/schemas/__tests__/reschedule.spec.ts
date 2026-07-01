/**
 * Schema-level tests for the RescheduleSheet form (P2-FE-1).
 *
 * Same caveat as `appointmentForm.spec.ts` — excluded from
 * `tsc --noEmit`, jest-expo semantics, runs unchanged once the
 * runner lands. Pure schema, no React Native deps.
 *
 * The legacy RescheduleSheet had no Zod-style validation at the
 * field level (its only guard was a missing-appointment Alert).
 * The new schema preserves that posture: every field is permissive
 * except for the Dayjs validity check (which catches programmer
 * error rather than user error).
 */

import dayjs from "dayjs";
import { rescheduleSchema } from "../reschedule";

describe("rescheduleSchema", () => {
  const validBase = {
    selectedDate: dayjs("2026-04-22T10:00:00"),
    durationMin: 60,
    notificationPreference: "email_and_text" as const,
    customMessage: "",
  };

  it("accepts a fully-populated reschedule payload", () => {
    const parsed = rescheduleSchema.safeParse(validBase);
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-Dayjs selectedDate", () => {
    const parsed = rescheduleSchema.safeParse({
      ...validBase,
      selectedDate: "2026-04-22T10:00:00" as unknown as dayjs.Dayjs,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid Dayjs selectedDate", () => {
    const parsed = rescheduleSchema.safeParse({
      ...validBase,
      selectedDate: dayjs("not-a-real-date"),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects zero or negative durationMin", () => {
    expect(rescheduleSchema.safeParse({ ...validBase, durationMin: 0 }).success).toBe(false);
    expect(rescheduleSchema.safeParse({ ...validBase, durationMin: -15 }).success).toBe(false);
  });

  it("only accepts the four canonical notification preferences", () => {
    expect(rescheduleSchema.safeParse({ ...validBase, notificationPreference: "email_and_text" }).success).toBe(true);
    expect(rescheduleSchema.safeParse({ ...validBase, notificationPreference: "text" }).success).toBe(true);
    expect(rescheduleSchema.safeParse({ ...validBase, notificationPreference: "email" }).success).toBe(true);
    expect(rescheduleSchema.safeParse({ ...validBase, notificationPreference: "none" }).success).toBe(true);
    expect(
      rescheduleSchema.safeParse({ ...validBase, notificationPreference: "carrier-pigeon" as never }).success,
    ).toBe(false);
  });

  it("treats customMessage as optional (empty string is valid)", () => {
    const parsed = rescheduleSchema.safeParse({ ...validBase, customMessage: "" });
    expect(parsed.success).toBe(true);
  });
});
