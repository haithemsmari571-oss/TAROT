import axiosClient from "@/lib/axiosClient";

// Types
export interface ZodiacSign {
  id: number;
  name: string;
  element: string;
  modality: string;
  ruling_planet: string;
  date_range_start: string;
  date_range_end: string;
  core_trait: string;
  signature_trait: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CosmicBondResponse {
  user_sign: string;
  partner_sign: string;
  love_percentage: number;
  communication_percentage: number;
  emotional_bond_percentage: number;
  overall_harmony_percentage: number;
  elemental_insight: string;
  compatibility_description?: string;
}

export interface LifePathReading {
  life_path_number: number;
  title: string;
  description: string;
  core_strengths: string[];
  growth_areas: string[];
  compatible_life_paths: Array<{
    number: number;
    title: string;
    compatibility_score: number;
  }>;
}

export interface SignCompatibilityDetail {
  sign_name: string;
  sign_id: number;
  compatibility_percentage: number;
  elemental_insight: string;
}

export interface FullChartResponse {
  sign_name: string;
  element: string;
  modality: string;
  ruling_planet: string;
  date_range: string;
  core_trait: string;
  signature_trait: string;
  description?: string;
  best_matches: SignCompatibilityDetail[];
  good_matches: SignCompatibilityDetail[];
  challenging_matches: SignCompatibilityDetail[];
}

export const oracleApi = {
  // Get all zodiac signs
  getZodiacSigns: async (): Promise<ZodiacSign[]> => {
    const response = await axiosClient.get("/zodiac/signs");
    return response.data;
  },

  // Get a specific zodiac sign
  getZodiacSign: async (signId: number): Promise<ZodiacSign> => {
    const response = await axiosClient.get(`/zodiac/signs/${signId}`);
    return response.data;
  },

  // Get full compatibility chart for a sign
  getFullChart: async (signId: number): Promise<FullChartResponse> => {
    const response = await axiosClient.get(`/zodiac/signs/${signId}/full-chart`);
    return response.data;
  },

  // Calculate compatibility by birthdays (DD/MM/YYYY format)
  calculateBirthdayCompatibility: async (
    userBirthday: string,
    partnerBirthday: string
  ): Promise<CosmicBondResponse> => {
    const response = await axiosClient.post("/zodiac/birthday-compatibility", {
      user_birthday: userBirthday,
      partner_birthday: partnerBirthday,
    });
    return response.data;
  },

  // Calculate compatibility by sign IDs
  calculateSignCompatibility: async (
    signId1: number,
    signId2: number
  ): Promise<CosmicBondResponse> => {
    const response = await axiosClient.post("/zodiac/sign-compatibility", {
      sign_id_1: signId1,
      sign_id_2: signId2,
    });
    return response.data;
  },

  // Get life path reading from birthdate (DD/MM/YYYY format)
  getLifePathReading: async (birthdate: string): Promise<LifePathReading> => {
    const response = await axiosClient.post("/zodiac/life-path", {
      birthdate: birthdate,
    });
    return response.data;
  },

  // Get life path number details by number
  getLifePathByNumber: async (number: number): Promise<any> => {
    const response = await axiosClient.get(`/zodiac/life-path/${number}`);
    return response.data;
  },
};
