import type { ObservationType } from "@technician/types/enums";

/**
 * Maps checklist template field labels to observation types.
 * Must stay in sync with the backend's CHECKLIST_FIELD_MAP in
 * deferred-service.service.ts.
 */
export const CHECKLIST_LABEL_TO_OBSERVATION: Record<string, ObservationType> = {
  "Headlights": "headlight_out",
  "Headlight": "headlight_out",
  "Tail Lights": "taillight_out",
  "Taillight": "taillight_out",
  "Tire Tread": "tire_wear",
  "Tire Condition": "tire_wear",
  "Tires": "tire_wear",
  "Tire Pressure": "low_tire_pressure",
  "Brake Pads": "brake_pad_thin",
  "Brake Pad Thickness": "brake_pad_thin",
  "Brakes": "brake_pad_thin",
  "Oil Leaks": "oil_leak",
  "Oil Leak": "oil_leak",
  "Windshield": "windshield_damage",
  "Windshield Condition": "windshield_damage",
  "Battery Terminals": "battery_corrosion",
  "Battery": "battery_corrosion",
  "Air Filter": "dirty_air_filter",
  "Air Filter Condition": "dirty_air_filter",
  "Wipers": "worn_wipers",
  "Wiper Blades": "worn_wipers",
  "Wiper Condition": "worn_wipers",
  "Coolant Level": "low_coolant",
  "Coolant": "low_coolant",
  "Transmission Fluid": "dirty_transmission_fluid",
  "Brake Fluid": "low_brake_fluid",
  "Check Engine Light": "check_engine_light",
  "CEL": "check_engine_light",
  "Oil Life": "oil_leak",
  "Fluid Condition": "low_coolant",
};
