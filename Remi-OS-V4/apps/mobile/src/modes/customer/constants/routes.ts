/** Customer app deep-link / router paths (mounted under `app/customer/`). */
export const CUSTOMER_PREFIX = '/customer' as const;

export const CustomerRoutes = {
  home: `${CUSTOMER_PREFIX}`,
  book: `${CUSTOMER_PREFIX}/book`,
  garage: `${CUSTOMER_PREFIX}/garage`,
  messages: `${CUSTOMER_PREFIX}/messages`,
  booking: {
    selectService: `${CUSTOMER_PREFIX}/booking/select-service`,
    selectVehicle: `${CUSTOMER_PREFIX}/booking/select-vehicle`,
    selectAddress: `${CUSTOMER_PREFIX}/booking/select-address`,
    smartSuggestions: `${CUSTOMER_PREFIX}/booking/smart-suggestions`,
    review: `${CUSTOMER_PREFIX}/booking/review`,
    confirmed: `${CUSTOMER_PREFIX}/booking/confirmed`,
    noAvailability: `${CUSTOMER_PREFIX}/booking/no-availability`,
    chat: `${CUSTOMER_PREFIX}/booking/chat`,
  },
  vehicle: (id: string | number) => `${CUSTOMER_PREFIX}/vehicle/${id}`,
  vehicleHealth: (id: string | number) => `${CUSTOMER_PREFIX}/vehicle/${id}/health`,
  vehicleAdd: `${CUSTOMER_PREFIX}/vehicle/add`,
  appointment: (id: string | number) => `${CUSTOMER_PREFIX}/appointment/${id}`,
  appointmentServiceRecord: (id: string | number) =>
    `${CUSTOMER_PREFIX}/appointment/${id}/service-record`,
  fleet: `${CUSTOMER_PREFIX}/fleet`,
  fleetVehicles: `${CUSTOMER_PREFIX}/fleet/vehicles`,
  fleetVehicle: (id: string | number) => `${CUSTOMER_PREFIX}/fleet/vehicles/${id}`,
  fleetBook: `${CUSTOMER_PREFIX}/fleet/book`,
  fleetInspectionSubmit: `${CUSTOMER_PREFIX}/fleet/inspection/submit`,
  fleetDrivers: `${CUSTOMER_PREFIX}/fleet/drivers`,
  fleetCompliance: `${CUSTOMER_PREFIX}/fleet/compliance`,
  referral: `${CUSTOMER_PREFIX}/referral`,
  referralDetail: (id: string | number) => `${CUSTOMER_PREFIX}/referral/${id}`,
  inboxApprovals: `${CUSTOMER_PREFIX}/inbox/approvals`,
  inboxApprovalSession: (id: string | number) =>
    `${CUSTOMER_PREFIX}/inbox/approvals/${id}`,
  inboxApprovalDecline: (id: string | number) =>
    `${CUSTOMER_PREFIX}/inbox/approvals/${id}/decline`,
  scheduleMultiReschedule: `${CUSTOMER_PREFIX}/schedule/multi-reschedule`,
  message: (id: string | number) => `${CUSTOMER_PREFIX}/messages/${id}`,
  profileEdit: `${CUSTOMER_PREFIX}/profile/edit`,
  paymentMethods: `${CUSTOMER_PREFIX}/payment-methods`,
  preferences: `${CUSTOMER_PREFIX}/preferences`,
  notificationSettings: `${CUSTOMER_PREFIX}/notification-settings`,
  onboardingWelcome: `${CUSTOMER_PREFIX}/(onboarding)/welcome`,
  rating: (id: string | number) => `${CUSTOMER_PREFIX}/rating/${id}`,
  fleetShuttle: (id: string | number) => `${CUSTOMER_PREFIX}/fleet/shuttle/${id}`,
} as const;
