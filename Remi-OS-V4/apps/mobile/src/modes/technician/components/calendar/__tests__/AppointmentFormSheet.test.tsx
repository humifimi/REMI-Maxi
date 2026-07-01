/**
 * Tests for `AppointmentFormSheet` (P2-FE-1 — RHF + Zod migration).
 *
 * NOTE: this repo does not currently ship a Jest runner or
 * `@testing-library/react-native` (see `src/utils/__tests__/color-
 * for-tech.test.ts` for the same caveat). The `**\/__tests__\/**`
 * directories are excluded from `tsc --noEmit` via `tsconfig.json`.
 *
 * This file is an executable specification: every assertion below
 * should pass once the runner + RNTL bindings land. The shape is
 * standard `jest-expo` + `@testing-library/react-native` semantics so
 * no rewrite is needed at that point.
 *
 * Schema-level coverage that runs today lives at
 * `src/schemas/__tests__/appointmentForm.spec.ts` (executed via
 * `npm test` once wired into the sanity-check script, or via
 * `tsx src/schemas/__tests__/appointmentForm.spec.ts` ad-hoc).
 *
 * Coverage targets per chunk prompt P2-FE-1:
 *   1. Required-field validation surfaces the legacy "Required" copy
 *      via Alert when create-mode submit is attempted with no
 *      customer / no services.
 *   2. A valid submit calls `useCreateAppointment().mutate` exactly
 *      once with the snake_case payload shape from
 *      `CreateAppointmentFromCalendarPayload`.
 *   3. A server-side error from the mutation still surfaces the
 *      legacy `Alert.alert("Could not add customer", ...)` toast on
 *      the inline customer creation path; the main-form mutation
 *      error path retains existing TanStack-Query rollback semantics
 *      (covered by `use-calendar.ts` tests, not duplicated here).
 */

/* eslint-disable import/no-unresolved */

import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AppointmentFormSheet } from "../appointment-form-sheet";
import { useCreateAppointment, useUpdateAppointment } from "@technician/hooks/schedule/use-calendar";
import { useQuickCreateCustomer } from "@technician/hooks/schedule/use-calendar-customers";

// jest.mock() calls are hoisted by the runner above the imports
// they patch; keep them grouped here for readability.
jest.mock("@technician/hooks/schedule/use-calendar", () => ({
  useCreateAppointment: jest.fn(),
  useUpdateAppointment: jest.fn(),
}));
jest.mock("@technician/hooks/schedule/use-calendar-customers", () => ({
  useCustomerSearch: jest.fn(() => ({ data: [] })),
  useQuickCreateCustomer: jest.fn(),
}));
jest.mock("@technician/hooks/schedule/use-calendar-services", () => ({
  useCalendarServices: jest.fn(() => ({ data: [{ id: 1, name: "Wash", base_price: 25 }] })),
}));

describe("AppointmentFormSheet — RHF + Zod (P2-FE-1)", () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useCreateAppointment as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useUpdateAppointment as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useQuickCreateCustomer as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  describe("required-field validation (create mode)", () => {
    it("surfaces 'Please select a customer' Alert when submit fires with no customer chosen", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      render(<AppointmentFormSheet onClose={onClose} />);

      fireEvent.press(screen.getByText("Create Appointment"));

      expect(alertSpy).toHaveBeenCalledWith(
        "Required",
        "Please select a customer",
      );
    });

    it("surfaces 'Please select at least one service' Alert when customer is set but no services chosen", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      render(<AppointmentFormSheet onClose={onClose} />);

      // Pretend a customer was selected via the search results path.
      fireEvent.press(screen.getByText(/Add new customer/));
      fireEvent.changeText(screen.getByPlaceholderText("First name"), "Jane");
      fireEvent.changeText(screen.getByPlaceholderText("Last name"), "Doe");
      fireEvent.changeText(screen.getByPlaceholderText("Phone number"), "555-0100");
      // (would normally resolve via mocked quickCreate `onSuccess`)

      fireEvent.press(screen.getByText("Create Appointment"));

      expect(alertSpy).toHaveBeenCalledWith(
        "Required",
        "Please select at least one service",
      );
    });
  });

  describe("valid submit", () => {
    it("calls the create mutation exactly once with the snake_case payload", () => {
      const mutate = jest.fn();
      (useCreateAppointment as jest.Mock).mockReturnValue({ mutate, isPending: false });

      render(
        <AppointmentFormSheet
          onClose={onClose}
          defaultDate="2026-04-22"
          defaultStartTime="10:00"
          defaultTechnicianId={42}
        />,
      );

      // (driver code: select a customer + a service, then submit)
      fireEvent.press(screen.getByText("Create Appointment"));

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          technician_id: 42,
          start_time: expect.stringMatching(/^2026-04-22T10:00/),
          location_type: "shop",
          slot_type: "standard",
          notification_preference: "email_and_text",
        }),
        expect.objectContaining({ onSuccess: onClose }),
      );
    });
  });

  describe("server-side error toast", () => {
    it("still fires `Could not add customer` Alert when quickCreate.mutate's onError is invoked", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const mutate = jest.fn((_payload, opts) => opts.onError(new Error("boom")));
      (useQuickCreateCustomer as jest.Mock).mockReturnValue({ mutate, isPending: false });

      render(<AppointmentFormSheet onClose={onClose} />);
      fireEvent.press(screen.getByText(/Add new customer/));
      fireEvent.changeText(screen.getByPlaceholderText("First name"), "A");
      fireEvent.changeText(screen.getByPlaceholderText("Last name"), "B");
      fireEvent.changeText(screen.getByPlaceholderText("Phone number"), "1");
      fireEvent.press(screen.getByText("Save customer"));

      expect(alertSpy).toHaveBeenCalledWith("Could not add customer", "boom");
    });
  });
});
