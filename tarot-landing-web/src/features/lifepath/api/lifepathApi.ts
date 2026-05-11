import axiosClient from "@/lib/axiosClient";
import type {
  LifePathNumber,
  LifePathCompatibility,
  LifePathNumberCreate,
  LifePathNumberUpdate,
  LifePathCompatibilityCreate,
  LifePathCompatibilityUpdate,
} from "../types/lifepath.types";

export const lifepathApi = {
  // ===== Life Path Numbers CRUD =====

  /**
   * Get all life path numbers
   */
  getLifePathNumbers: async (): Promise<LifePathNumber[]> => {
    const response = await axiosClient.get("/admin/zodiac/life-paths");
    return response.data;
  },

  /**
   * Get a specific life path number by ID
   */
  getLifePathNumberById: async (lifePathId: number): Promise<LifePathNumber> => {
    const response = await axiosClient.get(`/admin/zodiac/life-paths/${lifePathId}`);
    return response.data;
  },

  /**
   * Create a new life path number
   */
  createLifePathNumber: async (
    lifePathData: LifePathNumberCreate
  ): Promise<LifePathNumber> => {
    const response = await axiosClient.post("/admin/zodiac/life-paths", lifePathData);
    return response.data;
  },

  /**
   * Update an existing life path number
   */
  updateLifePathNumber: async (
    lifePathId: number,
    lifePathData: LifePathNumberUpdate
  ): Promise<LifePathNumber> => {
    const response = await axiosClient.put(
      `/admin/zodiac/life-paths/${lifePathId}`,
      lifePathData
    );
    return response.data;
  },

  /**
   * Delete a life path number
   */
  deleteLifePathNumber: async (lifePathId: number): Promise<void> => {
    await axiosClient.delete(`/admin/zodiac/life-paths/${lifePathId}`);
  },

  // ===== Life Path Compatibility CRUD =====

  /**
   * Get all life path compatibility records
   */
  getLifePathCompatibilities: async (): Promise<LifePathCompatibility[]> => {
    const response = await axiosClient.get("/admin/zodiac/life-path-compatibility");
    return response.data;
  },

  /**
   * Get a specific compatibility record by ID
   */
  getLifePathCompatibilityById: async (
    compatibilityId: number
  ): Promise<LifePathCompatibility> => {
    const response = await axiosClient.get(
      `/admin/zodiac/life-path-compatibility/${compatibilityId}`
    );
    return response.data;
  },

  /**
   * Create a new compatibility record
   */
  createLifePathCompatibility: async (
    compatibilityData: LifePathCompatibilityCreate
  ): Promise<LifePathCompatibility> => {
    const response = await axiosClient.post(
      "/admin/zodiac/life-path-compatibility",
      compatibilityData
    );
    return response.data;
  },

  /**
   * Update an existing compatibility record
   */
  updateLifePathCompatibility: async (
    compatibilityId: number,
    compatibilityData: LifePathCompatibilityUpdate
  ): Promise<LifePathCompatibility> => {
    const response = await axiosClient.put(
      `/admin/zodiac/life-path-compatibility/${compatibilityId}`,
      compatibilityData
    );
    return response.data;
  },

  /**
   * Delete a compatibility record
   */
  deleteLifePathCompatibility: async (compatibilityId: number): Promise<void> => {
    await axiosClient.delete(
      `/admin/zodiac/life-path-compatibility/${compatibilityId}`
    );
  },
};
