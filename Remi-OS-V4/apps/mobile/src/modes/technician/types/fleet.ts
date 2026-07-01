export type DueSoonSegment = "overdue" | "due_7" | "due_14";

export interface FleetDueSoonVehicle {
  vehicle_id: number;
  fleet_company_id: number;
  fleet_company_name: string;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  last_service_date: string | null;
  last_service_mileage: number | null;
  estimated_due_date: string | null;
  estimated_due_mileage: number | null;
  service_type_due: string | null;
  days_until_due: number | null;
  segment: DueSoonSegment;
}

export interface FleetDueSoonResponse {
  overdue: FleetDueSoonVehicle[];
  due_7: FleetDueSoonVehicle[];
  due_14: FleetDueSoonVehicle[];
  total_count: number;
}

export interface NudgeTemplate {
  key: string;
  label: string;
  body: string;
  icon: "schedule" | "warning" | "location-on" | "edit";
}

export type NudgeChannel = "sms" | "email" | "call_list" | "schedule_block";

export type NudgeTargetType = "coordinator" | "drivers";

export interface NudgeSendPayload {
  vehicle_ids: number[];
  channel: NudgeChannel;
  template_key: string;
  custom_message?: string;
  target_type: NudgeTargetType;
  filter_service_type?: string;
  filter_region?: string;
  schedule_date?: string;
}

export interface NudgeSendResponse {
  sent: number;
  failed: number;
  channel: NudgeChannel;
}
