export interface Review {
  id: number;
  user_id: number;
  psychic_id: number;
  username: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCreate {
  psychic_id: number;
  rating: number;
  comment?: string | null;
}

export interface ReviewUpdate {
  rating?: number;
  comment?: string | null;
}

export interface PsychicReviewSummary {
  psychic_id: number;
  total_reviews: number;
  average_rating: number;
  rating_distribution: Record<number, number>;
}
