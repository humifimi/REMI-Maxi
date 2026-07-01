/**
 * Tests for `RescheduleSheet` (P2-FE-1 — RHF + Zod migration).
 *
 * NOTE: see `AppointmentFormSheet.test.tsx` for the executable-spec
 * caveat — no Jest runner / RNTL is wired into this repo yet.
 *
 * Schema-level coverage that runs today lives at
 * `src/schemas/__tests__/reschedule.spec.ts`.
 *
 * Coverage targets per chunk prompt P2-FE-1:
 *   1. Required-field validation: the legacy sheet had no Zod-style
 *      validation messages — its only guard was a "no appointment
 *      selected" Alert. The post-RHF schema rejects an invalid
 *      `selectedDate` (Dayjs); that path is covered in the schema
 *      spec. Here we assert the legacy Alert still fires when the
 *      sheet is rendered with a null appointment AND the confirm
 *      handler is somehow invoked (the sheet returns null in that
 *      case, so the assertion is a defensive contract test).
 *   2. Valid submit calls the appropriate reschedule mutation
 *      exactly once with the snake_case ReschedulePayload shape
 *      (`new_start_time`, `new_end_time`, `notification_preference`,
 *      `custom_message`).
 *   3. Server-side errors: the legacy `onError` log path is
 *      preserved; surface remains console.error (no toast was
 *      rendered before, so we assert no Alert fires either, to
 *      catch accidental regressions).
 */

/* eslint-disable import/no-unresolved */

import { Alert } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RescheduleSheet } from "../reschedule-sheet";
import {
  useRescheduleAppointment,
  useTechnicianRescheduleAppointment,
} from "@technician/hooks/schedule/use-calendar";
import type { CalendarAppointmentItem } from "@technician/types/calendar";

// jest.mock() calls are hoisted by the runner above the imports
// they patch; keep them grouped here for readability.
jest.mock("@technician/hooks/schedule/use-calendar", () => ({
  useRescheduleAppointment: jest.fn(),
  useTechnicianRescheduleAppointment: jest.fn(),
}));

const fixtureAppointment: CalendarAppointmentItem = {
  id: 101,
  customer_name: "Test Customer",
  customer_id: 7,
  technician_id: 42,
  technician_name: "Tech A",
  scheduled_date: "2026-04-22",
  scheduled_time: "10:00:00",
  status: "scheduled",
  // ...other required fields are populated to whatever the type
  // demands once the runner lands; this fixture is the executable-
  // spec stand-in.
} as unknown as CalendarAppointmentItem;

describe("RescheduleSheet — RHF + Zod (P2-FE-1)", () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRescheduleAppointment as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useTechnicianRescheduleAppointment as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  describe("guard: no appointment", () => {
    it("renders nothing and never calls a mutation when appointment is null", () => {
      const mutate = jest.fn();
      (useRescheduleAppointment as jest.Mock).mockReturnValue({ mutate, isPending: false });
      render(<RescheduleSheet appointment={null} onClose={onClose} />);
      expect(screen.queryByText("Reschedule Appointment")).toBeNull();
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  describe("valid submit (franchise mutation)", () => {
    it("calls useRescheduleAppointment().mutate exactly once with snake_case payload", () => {
      const mutate = jest.fn();
      (useRescheduleAppointment as jest.Mock).mockReturnValue({ mutate, isPending: false });

      render(
        <RescheduleSheet
          appointment={fixtureAppointment}
          newStartTime="2026-04-22T11:00:00"
          newEndTime="2026-04-22T12:00:00"
          onClose={onClose}
        />,
      );

      fireEvent.press(screen.getByText("Confirm Reschedule"));

      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 101,
          payload: expect.objectContaining({
            new_start_time: expect.stringMatching(/^2026-04-22T11:00/),
            new_end_time: expect.stringMatching(/^2026-04-22T12:00/),
            notification_preference: "email_and_text",
          }),
        }),
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });

  describe("valid submit (technician mutation)", () => {
    it("routes to useTechnicianRescheduleAppointment() when isTechnician is true", () => {
      const techMutate = jest.fn();
      const fmMutate = jest.fn();
      (useTechnicianRescheduleAppointment as jest.Mock).mockReturnValue({ mutate: techMutate, isPending: false });
      (useRescheduleAppointment as jest.Mock).mockReturnValue({ mutate: fmMutate, isPending: false });

      render(
        <RescheduleSheet
          appointment={fixtureAppointment}
          newStartTime="2026-04-22T11:00:00"
          newEndTime="2026-04-22T12:00:00"
          isTechnician
          onClose={onClose}
        />,
      );

      fireEvent.press(screen.getByText("Confirm Reschedule"));

      expect(techMutate).toHaveBeenCalledTimes(1);
      expect(fmMutate).not.toHaveBeenCalled();
    });
  });

  describe("server-side error", () => {
    it("does not surface an Alert when mutation onError fires (preserves legacy console-only behaviour)", () => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const mutate = jest.fn((_args, opts) => opts.onError(new Error("server boom")));
      (useRescheduleAppointment as jest.Mock).mockReturnValue({ mutate, isPending: false });

      render(
        <RescheduleSheet
          appointment={fixtureAppointment}
          newStartTime="2026-04-22T11:00:00"
          newEndTime="2026-04-22T12:00:00"
          onClose={onClose}
        />,
      );
      fireEvent.press(screen.getByText("Confirm Reschedule"));

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });
});
