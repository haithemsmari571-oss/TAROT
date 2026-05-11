import axiosClient from "@/lib/axiosClient";
import type {
  ZodiacSign,
  ZodiacCompatibility,
  ZodiacSignCreate,
  ZodiacSignUpdate,
  ZodiacCompatibilityCreate,
  ZodiacCompatibilityUpdate,
} from "../types/zodiac.types";

export const zodiacApi = {
  // ===== Zodiac Signs CRUD =====
  
  /**
   * Get all zodiac signs
   */
  getZodiacSigns: async (): Promise<ZodiacSign[]> => {
    const response = await axiosClient.get("/admin/zodiac/zodiac/signs");
    return response.data;
  },

  /**
   * Get a specific zodiac sign by ID
   */
  getZodiacSignById: async (signId: number): Promise<ZodiacSign> => {
    const response = await axiosClient.get(`/admin/zodiac/zodiac/signs/${signId}`);
    return response.data;
  },

  /**
   * Create a new zodiac sign
   */
  createZodiacSign: async (signData: ZodiacSignCreate): Promise<ZodiacSign> => {
    const response = await axiosClient.post("/admin/zodiac/zodiac/signs", signData);
    return response.data;
  },

  /**
   * Update an existing zodiac sign
   */
  updateZodiacSign: async (
    signId: number,
    signData: ZodiacSignUpdate
  ): Promise<ZodiacSign> => {
    const response = await axiosClient.put(
      `/admin/zodiac/zodiac/signs/${signId}`,
      signData
    );
    return response.data;
  },

  /**
   * Delete a zodiac sign
   */
  deleteZodiacSign: async (signId: number): Promise<void> => {
    await axiosClient.delete(`/admin/zodiac/zodiac/signs/${signId}`);
  },

  // ===== Zodiac Compatibility CRUD =====

  /**
   * Get all zodiac compatibility records
   */
  getZodiacCompatibilities: async (): Promise<ZodiacCompatibility[]> => {
    const response = await axiosClient.get("/admin/zodiac/zodiac/compatibility");
    return response.data;
  },

  /**
   * Get a specific compatibility record by ID
   */
  getZodiacCompatibilityById: async (
    compatibilityId: number
  ): Promise<ZodiacCompatibility> => {
    const response = await axiosClient.get(
      `/admin/zodiac/zodiac/compatibility/${compatibilityId}`
    );
    return response.data;
  },

  /**
   * Create a new compatibility record
   */
  createZodiacCompatibility: async (
    compatibilityData: ZodiacCompatibilityCreate
  ): Promise<ZodiacCompatibility> => {
    const response = await axiosClient.post(
      "/admin/zodiac/zodiac/compatibility",
      compatibilityData
    );
    return response.data;
  },

  /**
   * Update an existing compatibility record
   */
  updateZodiacCompatibility: async (
    compatibilityId: number,
    compatibilityData: ZodiacCompatibilityUpdate
  ): Promise<ZodiacCompatibility> => {
    const response = await axiosClient.put(
      `/admin/zodiac/zodiac/compatibility/${compatibilityId}`,
      compatibilityData
    );
    return response.data;
  },

  /**
   * Delete a compatibility record
   */
  deleteZodiacCompatibility: async (compatibilityId: number): Promise<void> => {
    await axiosClient.delete(`/admin/zodiac/zodiac/compatibility/${compatibilityId}`);
  },
};
