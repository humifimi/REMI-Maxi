export const UserRole = {
  CUSTOMER: 'customer',
  TECHNICIAN: 'technician',
  FRANCHISE_OWNER: 'franchise_owner',
  DISPATCHER: 'dispatcher',
  FRANCHISOR: 'franchisor',
  ADMINISTRATOR: 'administrator',
  FLEET_MANAGER: 'fleet_manager',
  FLEET_DRIVER: 'fleet_driver',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BANNED: 'banned',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const AppointmentStatus = {
  CREATED: 'created',
  CONFIRMED: 'confirmed',
  ACCEPTED: 'accepted',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  WRAP_UP: 'wrap_up',
  COMPLETED: 'completed',
  PAID: 'paid',
  CANCELLED: 'cancelled',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  [AppointmentStatus.CREATED]: 'Requested',
  [AppointmentStatus.CONFIRMED]: 'Confirmed',
  [AppointmentStatus.ACCEPTED]: 'Accepted',
  [AppointmentStatus.EN_ROUTE]: 'Tech En Route',
  [AppointmentStatus.ARRIVED]: 'Arrived',
  [AppointmentStatus.IN_PROGRESS]: 'In Progress',
  [AppointmentStatus.WRAP_UP]: 'Wrapping Up',
  [AppointmentStatus.COMPLETED]: 'Completed',
  [AppointmentStatus.PAID]: 'Invoiced',
  [AppointmentStatus.CANCELLED]: 'Cancelled',
};

export const APPOINTMENT_TIMELINE_ORDER: AppointmentStatus[] = [
  AppointmentStatus.CREATED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.EN_ROUTE,
  AppointmentStatus.IN_PROGRESS,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.PAID,
];

export const NotificationType = {
  APPOINTMENT_UPDATE: 'appointment_update',
  PAYMENT: 'payment',
  SYSTEM: 'system',
  PROMOTION: 'promotion',
  RATING_REQUEST: 'rating_request',
  REFERRAL: 'referral',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const AppointmentServiceStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;
export type AppointmentServiceStatus = (typeof AppointmentServiceStatus)[keyof typeof AppointmentServiceStatus];

export const LineItemType = {
  PART: 'part',
  FLUID: 'fluid',
  LABOR: 'labor',
  FEE: 'fee',
  DISCOUNT: 'discount',
} as const;
export type LineItemType = (typeof LineItemType)[keyof typeof LineItemType];

export const ObservationType = {
  DIRTY_AIR_FILTER: 'dirty_air_filter',
  WORN_WIPERS: 'worn_wipers',
  LOW_COOLANT: 'low_coolant',
  DIRTY_TRANSMISSION_FLUID: 'dirty_transmission_fluid',
  LOW_BRAKE_FLUID: 'low_brake_fluid',
  TIRE_WEAR: 'tire_wear',
  UNEVEN_TREAD: 'uneven_tread',
  LOW_TIRE_PRESSURE: 'low_tire_pressure',
  BRAKE_PAD_THIN: 'brake_pad_thin',
  BRAKE_NOISE: 'brake_noise',
  HEADLIGHT_OUT: 'headlight_out',
  TAILLIGHT_OUT: 'taillight_out',
  WINDSHIELD_DAMAGE: 'windshield_damage',
  CHECK_ENGINE_LIGHT: 'check_engine_light',
  BATTERY_CORROSION: 'battery_corrosion',
  OIL_LEAK: 'oil_leak',
  OTHER: 'other',
} as const;
export type ObservationType = (typeof ObservationType)[keyof typeof ObservationType];

export const OBSERVATION_TYPE_LABELS: Record<ObservationType, string> = {
  [ObservationType.DIRTY_AIR_FILTER]: 'Dirty Air Filter',
  [ObservationType.WORN_WIPERS]: 'Worn Wiper Blades',
  [ObservationType.LOW_COOLANT]: 'Low Coolant',
  [ObservationType.DIRTY_TRANSMISSION_FLUID]: 'Dirty Transmission Fluid',
  [ObservationType.LOW_BRAKE_FLUID]: 'Low Brake Fluid',
  [ObservationType.TIRE_WEAR]: 'Tire Wear',
  [ObservationType.UNEVEN_TREAD]: 'Uneven Tire Tread',
  [ObservationType.LOW_TIRE_PRESSURE]: 'Low Tire Pressure',
  [ObservationType.BRAKE_PAD_THIN]: 'Thin Brake Pads',
  [ObservationType.BRAKE_NOISE]: 'Brake Noise',
  [ObservationType.HEADLIGHT_OUT]: 'Headlight Out',
  [ObservationType.TAILLIGHT_OUT]: 'Taillight Out',
  [ObservationType.WINDSHIELD_DAMAGE]: 'Windshield Damage',
  [ObservationType.CHECK_ENGINE_LIGHT]: 'Check Engine Light',
  [ObservationType.BATTERY_CORROSION]: 'Battery Corrosion',
  [ObservationType.OIL_LEAK]: 'Oil Leak',
  [ObservationType.OTHER]: 'Other',
};

export const DeferredWorkSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;
export type DeferredWorkSeverity = (typeof DeferredWorkSeverity)[keyof typeof DeferredWorkSeverity];

export const DeferredWorkStatus = {
  OBSERVED: 'observed',
  COMMUNICATED: 'communicated',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  DECLINED: 'declined',
  EXPIRED: 'expired',
} as const;
export type DeferredWorkStatus = (typeof DeferredWorkStatus)[keyof typeof DeferredWorkStatus];

export const PreferredTimeOfDay = {
  MORNING: 'morning',
  MIDDAY: 'midday',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  ANY: 'any',
} as const;
export type PreferredTimeOfDay = (typeof PreferredTimeOfDay)[keyof typeof PreferredTimeOfDay];

export const PREFERRED_TIME_LABELS: Record<PreferredTimeOfDay, string> = {
  [PreferredTimeOfDay.MORNING]: 'Morning',
  [PreferredTimeOfDay.MIDDAY]: 'Midday',
  [PreferredTimeOfDay.AFTERNOON]: 'Afternoon',
  [PreferredTimeOfDay.EVENING]: 'Evening',
  [PreferredTimeOfDay.ANY]: 'Any Time',
};

export const CommunicationMode = {
  TEXT_ONLY: 'text_only',
  CALL_FIRST: 'call_first',
  EMAIL_PREFERRED: 'email_preferred',
  IN_APP_ONLY: 'in_app_only',
} as const;
export type CommunicationMode = (typeof CommunicationMode)[keyof typeof CommunicationMode];

export const COMMUNICATION_MODE_LABELS: Record<CommunicationMode, string> = {
  [CommunicationMode.TEXT_ONLY]: 'Text Only',
  [CommunicationMode.CALL_FIRST]: 'Call First',
  [CommunicationMode.EMAIL_PREFERRED]: 'Email Preferred',
  [CommunicationMode.IN_APP_ONLY]: 'In-App Only',
};

export const SameTechStrength = {
  SOFT: 'soft',
  HARD: 'hard',
} as const;
export type SameTechStrength = (typeof SameTechStrength)[keyof typeof SameTechStrength];

export const ServiceBehavior = {
  LEAVES_KEYS: 'leaves_keys',
  WAITS_OUTSIDE: 'waits_outside',
  VEHICLE_UNLOCKED: 'vehicle_unlocked',
  MEETS_AT_DOOR: 'meets_at_door',
} as const;
export type ServiceBehavior = (typeof ServiceBehavior)[keyof typeof ServiceBehavior];

export const SERVICE_BEHAVIOR_LABELS: Record<ServiceBehavior, string> = {
  [ServiceBehavior.LEAVES_KEYS]: 'Leave keys in vehicle',
  [ServiceBehavior.WAITS_OUTSIDE]: 'Wait outside',
  [ServiceBehavior.VEHICLE_UNLOCKED]: 'Vehicle will be unlocked',
  [ServiceBehavior.MEETS_AT_DOOR]: 'Meet at door',
};

export const Weekday = {
  MON: 'mon',
  TUE: 'tue',
  WED: 'wed',
  THU: 'thu',
  FRI: 'fri',
  SAT: 'sat',
  SUN: 'sun',
} as const;
export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  [Weekday.MON]: 'Mon',
  [Weekday.TUE]: 'Tue',
  [Weekday.WED]: 'Wed',
  [Weekday.THU]: 'Thu',
  [Weekday.FRI]: 'Fri',
  [Weekday.SAT]: 'Sat',
  [Weekday.SUN]: 'Sun',
};

export const LeadTimePreference = {
  SAME_DAY: 'same_day',
  ONE_DAY: 'one_day',
  TWO_DAYS: 'two_days',
  ONE_WEEK: 'one_week',
} as const;
export type LeadTimePreference = (typeof LeadTimePreference)[keyof typeof LeadTimePreference];

export const LEAD_TIME_LABELS: Record<LeadTimePreference, string> = {
  [LeadTimePreference.SAME_DAY]: 'Same day is fine',
  [LeadTimePreference.ONE_DAY]: '1 day notice',
  [LeadTimePreference.TWO_DAYS]: '2 days notice',
  [LeadTimePreference.ONE_WEEK]: '1 week notice',
};

export const LEAD_TIME_TO_DAYS: Record<LeadTimePreference, number> = {
  [LeadTimePreference.SAME_DAY]: 0,
  [LeadTimePreference.ONE_DAY]: 1,
  [LeadTimePreference.TWO_DAYS]: 2,
  [LeadTimePreference.ONE_WEEK]: 7,
};

export function daysToLeadTime(days: number | null): LeadTimePreference | null {
  if (days === null || days === undefined) return null;
  const entry = Object.entries(LEAD_TIME_TO_DAYS).find(([, d]) => d === days);
  return entry ? (entry[0] as LeadTimePreference) : null;
}

export const PreferredLocation = {
  HOME: 'home',
  OFFICE: 'office',
  OTHER: 'other',
} as const;
export type PreferredLocation = (typeof PreferredLocation)[keyof typeof PreferredLocation];

export const PREFERRED_LOCATION_LABELS: Record<PreferredLocation, string> = {
  [PreferredLocation.HOME]: 'Home',
  [PreferredLocation.OFFICE]: 'Office',
  [PreferredLocation.OTHER]: 'Other',
};

export const TirePosition = {
  LEFT_FRONT: 'left_front',
  RIGHT_FRONT: 'right_front',
  LEFT_REAR: 'left_rear',
  RIGHT_REAR: 'right_rear',
} as const;
export type TirePosition = (typeof TirePosition)[keyof typeof TirePosition];

export const TIRE_POSITION_LABELS: Record<TirePosition, string> = {
  [TirePosition.LEFT_FRONT]: 'Left Front',
  [TirePosition.RIGHT_FRONT]: 'Right Front',
  [TirePosition.LEFT_REAR]: 'Left Rear',
  [TirePosition.RIGHT_REAR]: 'Right Rear',
};

export const FluidType = {
  COOLANT: 'coolant',
  WASHER: 'washer',
  BRAKE: 'brake',
  TRANSMISSION: 'transmission',
  POWER_STEERING: 'power_steering',
  DIFFERENTIAL: 'differential',
} as const;
export type FluidType = (typeof FluidType)[keyof typeof FluidType];

export const FLUID_TYPE_LABELS: Record<FluidType, string> = {
  [FluidType.COOLANT]: 'Coolant',
  [FluidType.WASHER]: 'Washer Fluid',
  [FluidType.BRAKE]: 'Brake Fluid',
  [FluidType.TRANSMISSION]: 'Transmission',
  [FluidType.POWER_STEERING]: 'Power Steering',
  [FluidType.DIFFERENTIAL]: 'Differential',
};

export const CheckResult = {
  NOT_CHECKED: 'not_checked',
  CHECKED_OK: 'checked_ok',
  REPLACED: 'replaced',
} as const;
export type CheckResult = (typeof CheckResult)[keyof typeof CheckResult];

export const CHECK_RESULT_LABELS: Record<CheckResult, string> = {
  [CheckResult.NOT_CHECKED]: 'Not Checked',
  [CheckResult.CHECKED_OK]: 'OK',
  [CheckResult.REPLACED]: 'Replaced',
};

export const RecommendationSource = {
  CARFAX_OEM: 'carfax_oem',
  MANUAL: 'manual',
} as const;
export type RecommendationSource = (typeof RecommendationSource)[keyof typeof RecommendationSource];

export const WorkSituation = {
  WORKS_FROM_HOME: 'works_from_home',
  TRAVELS: 'travels',
  SPOUSE_HANDLES: 'spouse_handles',
  OFFICE: 'office',
} as const;
export type WorkSituation = (typeof WorkSituation)[keyof typeof WorkSituation];

export const WORK_SITUATION_LABELS: Record<WorkSituation, string> = {
  [WorkSituation.WORKS_FROM_HOME]: 'Works from Home',
  [WorkSituation.TRAVELS]: 'Travels Frequently',
  [WorkSituation.SPOUSE_HANDLES]: 'Spouse Handles',
  [WorkSituation.OFFICE]: 'Goes to Office',
};

export const ReferralStatus = {
  DETECTED: 'detected',
  OFFERED: 'offered',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
} as const;
export type ReferralStatus = (typeof ReferralStatus)[keyof typeof ReferralStatus];

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  [ReferralStatus.DETECTED]: 'Detected',
  [ReferralStatus.OFFERED]: 'Offered',
  [ReferralStatus.QUOTED]: 'Quoted',
  [ReferralStatus.ACCEPTED]: 'Accepted',
  [ReferralStatus.SCHEDULED]: 'Scheduled',
  [ReferralStatus.COMPLETED]: 'Completed',
};

export const REFERRAL_TIMELINE_ORDER: ReferralStatus[] = [
  ReferralStatus.DETECTED,
  ReferralStatus.OFFERED,
  ReferralStatus.QUOTED,
  ReferralStatus.ACCEPTED,
  ReferralStatus.SCHEDULED,
  ReferralStatus.COMPLETED,
];

export const RelocationStatus = {
  STABLE: 'stable',
  MOVING_SOON: 'moving_soon',
  RECENTLY_MOVED: 'recently_moved',
} as const;
export type RelocationStatus = (typeof RelocationStatus)[keyof typeof RelocationStatus];

export const RELOCATION_STATUS_LABELS: Record<RelocationStatus, string> = {
  [RelocationStatus.STABLE]: 'Stable',
  [RelocationStatus.MOVING_SOON]: 'Moving Soon',
  [RelocationStatus.RECENTLY_MOVED]: 'Recently Moved',
};
