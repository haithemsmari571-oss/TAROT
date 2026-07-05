// Payment types matching backend API schemas

export interface CreateCheckoutSessionRequest {
  points_amount: number;
  return_url?: string;
}

export interface CreateStardustCheckoutSessionRequest {
  amount_usd: number;
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

/** One live Stardust bonus band (read-only mirror of app/services/stardust.py). */
export interface StardustTierBand {
  key: string;
  name: string;
  bonus_pct: number; // 0.25 == +25%
  min_usd: number;
  max_usd: number;
}

export interface StardustTiersResponse {
  min_usd: number;
  max_usd: number; // top of the range == Lifetime Access
  lifetime_copy: string;
  bands: StardustTierBand[];
}
