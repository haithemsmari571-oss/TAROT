/** Where the owner's approval stands (TAROT-BACKEND app/models/review.py). */
export type ReviewStatus = "pending" | "approved" | "hidden";

export interface Review {
  id: number;
  user_id: number;
  psychic_id: number;
  username: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  /** her own reviews only (GET /reviews/my-reviews); a public review is always approved */
  status?: ReviewStatus;
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
