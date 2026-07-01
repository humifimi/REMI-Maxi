import type { CreateBookingResponse } from '@customer/types/api';

// @demo-start
/**
 * When POST /bookings fails (local backend, validation, etc.), the review screen can still
 * navigate to confirmed so demos can complete the 60s booking flow. appointmentId 0 is
 * falsy on the success screen so no fake "Track" deep link is shown.
 */
export function buildDemoCreateBookingResponse(params: {
  scheduledDate: string;
  scheduledTime: string;
  technicianName: string | null;
}): CreateBookingResponse {
  return {
    appointmentId: 0,
    technicianName: params.technicianName,
    scheduledDate: params.scheduledDate,
    scheduledTime: params.scheduledTime,
    status: 'scheduled',
  };
}
// @demo-end
