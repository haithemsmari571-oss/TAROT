import axiosClient from "../../../lib/axiosClient";
import type { PaginatedResponse, Psychic, PsychicCreate, PsychicFilters, PsychicUpdate } from "../types/psychic.types";

export const psychicsApi = {
  /**
   * Get all psychics with optional filters
   */
  getPsychics: async (filters?: PsychicFilters): Promise<PaginatedResponse<Psychic>> => {
    const params = new URLSearchParams();

    if (filters?.is_online !== undefined) {
      params.append("is_online", String(filters.is_online));
    }
    if (filters?.min_price !== undefined) {
      params.append("min_price", String(filters.min_price));
    }
    if (filters?.max_price !== undefined) {
      params.append("max_price", String(filters.max_price));
    }
    if (filters?.categories_ids) {
      params.append("categories_ids", filters.categories_ids);
    }
    if (filters?.search) {
      params.append("search", filters.search);
    }
    if (filters?.skip !== undefined) {
      params.append("skip", String(filters.skip));
    }
    if (filters?.limit !== undefined) {
      params.append("limit", String(filters.limit));
    }

    const response = await axiosClient.get<PaginatedResponse<Psychic>>(`/psychic/?${params.toString()}`);
    return response.data;
  },

  /**
   * Get a single psychic by ID
   */
  getPsychicById: async (id: number): Promise<Psychic> => {
    const response = await axiosClient.get<Psychic>(`/psychic/${id}`);
    return response.data;
  },

  /**
   * Create a new psychic
   */
  createPsychic: async (data: PsychicCreate, profilePicture: File): Promise<Psychic> => {
    const formData = new FormData();

    // Append the psychic data as JSON string
    formData.append("psychic_data", JSON.stringify(data));

    // Append the profile picture file
    formData.append("profile_picture", profilePicture);

    const response = await axiosClient.post<Psychic>("/psychic/", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  /**
   * Update an existing psychic
   */
  updatePsychic: async (id: number, data: PsychicUpdate, profilePicture?: File): Promise<Psychic> => {
    const formData = new FormData();

    // Append the psychic update data as JSON string
    formData.append("psychic_data", JSON.stringify(data));

    // Append the profile picture file if provided
    if (profilePicture) {
      formData.append("profile_picture", profilePicture);
    }

    const response = await axiosClient.patch<Psychic>(`/psychic/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  /**
   * Delete a psychic
   */
  deletePsychic: async (id: number): Promise<void> => {
    await axiosClient.delete(`/psychic/${id}`);
  },
};
