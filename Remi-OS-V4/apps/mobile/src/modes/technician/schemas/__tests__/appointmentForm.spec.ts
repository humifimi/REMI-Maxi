/**
 * Schema-level tests for the AppointmentFormSheet form (P2-FE-1).
 *
 * Like the rest of `**\/__tests__\/**`, this file is excluded from
 * `tsc --noEmit` and follows jest-expo `describe/it/expect`
 * semantics so it slots into the runner once `jest-expo` is wired
 * (see `src/utils/__tests__/color-for-tech.test.ts` for the same
 * caveat). Schema tests are pure and have no React Native
 * dependencies, so they will run unchanged the moment the runner
 * lands.
 *
 * Coverage:
 *   - `customer` is required when creating, optional when editing
 *   - `services` requires at least one when creating, allows zero
 *     when editing
 *   - Validation copy matches the legacy `Alert.alert` strings
 *     verbatim ("Please select a customer", "Please select at least
 *     one service") so the in-sheet `useEffect` surfaces identical
 *     messages.
 *   - Slot type / notification preference enums lock to the same
 *     values the legacy `useState<SlotType>` / `useState<
 *     CalendarNotificationPreference>` accepted.
 *   - Quick-create customer sub-form mirrors the two legacy Alert
 *     strings ("First and last name are required", "Phone number is
 *     required").
 */

import {
  appointmentFormSchema,
  quickCreateCustomerSchema,
} from "../appointmentForm";

describe("appointmentFormSchema(create)", () => {
  const schema = appointmentFormSchema(false);

  const validBase = {
    customer: { id: 1, first_name: "A", last_name: "B" },
    services: [42],
    date: "2026-04-22",
    startTime: "10:00",
    slotType: "standard" as const,
    notificationPreference: "email_and_text" as const,
    note: "",
  };

  it("accepts a fully-populated create payload", () => {
    const parsed = schema.safeParse(validBase);
    expect(parsed.success).toBe(true);
  });

  it("requires a customer with the verbatim legacy copy", () => {
    const parsed = schema.safeParse({ ...validBase, customer: null });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const customerIssue = parsed.error.issues.find((i) => i.path[0] === "customer");
      expect(customerIssue?.message).toBe("Please select a customer");
    }
  });

  it("requires at least one service with the verbatim legacy copy", () => {
    const parsed = schema.safeParse({ ...validBase, services: [] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const servicesIssue = parsed.error.issues.find((i) => i.path[0] === "services");
      expect(servicesIssue?.message).toBe("Please select at least one service");
    }
  });

  it("rejects malformed YYYY-MM-DD dates", () => {
    const parsed = schema.safeParse({ ...validBase, date: "04/22/2026" });
    expect(parsed.success).toBe(false);
  });

  it("rejects malformed HH:MM start times", () => {
    const parsed = schema.safeParse({ ...validBase, startTime: "10am" });
    expect(parsed.success).toBe(false);
  });

  it("only accepts the four canonical slot types", () => {
    expect(schema.safeParse({ ...validBase, slotType: "standard" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, slotType: "eco" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, slotType: "priority" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, slotType: "flex_window" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, slotType: "bogus" as never }).success).toBe(false);
  });

  it("only accepts the four canonical notification preferences", () => {
    expect(schema.safeParse({ ...validBase, notificationPreference: "email_and_text" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, notificationPreference: "text" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, notificationPreference: "email" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, notificationPreference: "none" }).success).toBe(true);
    expect(schema.safeParse({ ...validBase, notificationPreference: "carrier-pigeon" as never }).success).toBe(false);
  });
});

describe("appointmentFormSchema(edit)", () => {
  const schema = appointmentFormSchema(true);

  it("accepts a payload with a null customer (edit hides customer UI)", () => {
    const parsed = schema.safeParse({
      customer: null,
      services: [],
      date: "2026-04-22",
      startTime: "10:00",
      slotType: "standard",
      notificationPreference: "email_and_text",
      note: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty service list when editing", () => {
    const parsed = schema.safeParse({
      customer: null,
      services: [],
      date: "2026-04-22",
      startTime: "10:00",
      slotType: "standard",
      notificationPreference: "email_and_text",
      note: "",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("quickCreateCustomerSchema", () => {
  it("accepts a fully-populated quick-create payload", () => {
    const parsed = quickCreateCustomerSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "555-0100",
      email: "jane@example.com",
    });
    expect(parsed.success).toBe(true);
  });

  it("surfaces the verbatim 'First and last name are required' copy when firstName is blank", () => {
    const parsed = quickCreateCustomerSchema.safeParse({
      firstName: "",
      lastName: "Doe",
      phone: "555-0100",
      email: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.find((i) => i.path[0] === "firstName")?.message)
        .toBe("First and last name are required");
    }
  });

  it("surfaces the verbatim 'First and last name are required' copy when lastName is blank", () => {
    const parsed = quickCreateCustomerSchema.safeParse({
      firstName: "Jane",
      lastName: "",
      phone: "555-0100",
      email: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.find((i) => i.path[0] === "lastName")?.message)
        .toBe("First and last name are required");
    }
  });

  it("surfaces the verbatim 'Phone number is required' copy when phone is blank", () => {
    const parsed = quickCreateCustomerSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "   ",
      email: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.find((i) => i.path[0] === "phone")?.message)
        .toBe("Phone number is required");
    }
  });

  it("treats email as optional (empty string is valid)", () => {
    const parsed = quickCreateCustomerSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      phone: "555",
      email: "",
    });
    expect(parsed.success).toBe(true);
  });
});
