import axiosClient from "@/lib/axiosClient";
import { Review, PsychicReviewSummary, ReviewCreate, ReviewUpdate } from "../types/review.types";

export const reviewsApi = {
  /**
   * Get all reviews for a specific psychic
   */
  getPsychicReviews: async (psychicId: number, skip: number = 0, limit: number = 100): Promise<Review[]> => {
    const response = await axiosClient.get<Review[]>(`/reviews/psychic/${psychicId}`, {
      params: { skip, limit }
    });
    return response.data;
  },

  /**
   * Get review summary statistics for a psychic
   */
  getPsychicReviewSummary: async (psychicId: number): Promise<PsychicReviewSummary> => {
    const response = await axiosClient.get<PsychicReviewSummary>(`/reviews/psychic/${psychicId}/summary`);
    return response.data;
  },

  /**
   * Get all reviews by the current user
   */
  getMyReviews: async (skip: number = 0, limit: number = 100): Promise<Review[]> => {
    const response = await axiosClient.get<Review[]>(`/reviews/my-reviews`, {
      params: { skip, limit }
    });
    return response.data;
  },

  /**
   * Create a new review
   */
  createReview: async (data: ReviewCreate): Promise<Review> => {
    const response = await axiosClient.post<Review>(`/reviews/`, data);
    return response.data;
  },

  /**
   * Update an existing review
   */
  updateReview: async (reviewId: number, data: ReviewUpdate): Promise<Review> => {
    const response = await axiosClient.put<Review>(`/reviews/${reviewId}`, data);
    return response.data;
  },

  /**
   * Delete a review
   */
  deleteReview: async (reviewId: number): Promise<void> => {
    await axiosClient.delete(`/reviews/${reviewId}`);
  },
};
