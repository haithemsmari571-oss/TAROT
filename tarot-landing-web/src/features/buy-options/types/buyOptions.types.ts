export interface BuyOption {
  id: number;
  label: string;
  points: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BuyOptionCreate {
  label: string;
  points: number;
  is_active?: boolean;
  sort_order?: number;
}

export interface BuyOptionUpdate {
  label?: string;
  points?: number;
  is_active?: boolean;
  sort_order?: number;
}
