// Payment types matching backend API schemas

export interface CreateCheckoutSessionRequest {
  points_amount: number;
  return_url?: string;
}

export interface CreateCheckoutSessionResponse {
  url: string;
}

export interface TopUpResponse {
  url: string;
  points_amount: number;
  estimated_minutes: number;
}

export interface UnitPriceResponse {
  unit_price_cents: number;
}

export interface PointsPackage {
  points: number;
  price: number; // in cents
  label: string;
  popular?: boolean;
  bonus?: number; // bonus points
}

export interface BuyOptionResponse {
  id: number;
  label: string;
  points: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
