import type { ReferralStatus } from './enums';

export interface ReferralPartnerQuote {
  id: number;
  partner_id: number;
  partner_name: string;
  partner_logo_url: string | null;
  distance_miles: number;
  price: number;
  estimated_availability: string | null;
  partner_rating: number | null;
  partner_review_count: number | null;
}

export interface ReferralVehicle {
  id: number;
  year: number | null;
  make: string | null;
  model: string | null;
  license_plate: string | null;
}

export interface ReferralCompletionDetails {
  partner_summary: string | null;
  final_cost: number | null;
  warranty_info: string | null;
  next_recommended_date: string | null;
}

export interface ReferralFleetApproval {
  required: boolean;
  status: 'pending' | 'approved' | 'declined' | null;
  decline_reason: string | null;
  approved_at: string | null;
  declined_at: string | null;
}

export interface Referral {
  id: number;
  appointment_id: number;
  customer_id: number;
  vehicle: ReferralVehicle;
  service_need: string;
  detecting_technician_name: string;
  detected_at: string;
  status: ReferralStatus;
  quotes: ReferralPartnerQuote[];
  selected_quote_id: number | null;
  selected_partner_name: string | null;
  fleet_approval: ReferralFleetApproval | null;
  completion_details: ReferralCompletionDetails | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralListItem {
  id: number;
  appointment_id: number;
  vehicle: ReferralVehicle;
  service_need: string;
  status: ReferralStatus;
  selected_partner_name: string | null;
  detected_at: string;
}

export interface AcceptQuoteRequest {
  quoteId: number;
}

export type ReferralSortField = 'price' | 'availability' | 'rating' | 'distance';
