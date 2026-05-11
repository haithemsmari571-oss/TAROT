// Life Path Number Model
export interface LifePathNumber {
  id: number;
  number: number; // 1-9, 11, 22, 33
  title: string;
  description: string;
  core_strengths: {
    strengths: string[];
  };
  growth_areas: {
    areas: string[];
  };
  created_at: string;
  updated_at: string;
}

// Life Path Compatibility Model
export interface LifePathCompatibility {
  id: number;
  life_path_id_1: number;
  life_path_id_2: number;
  compatibility_score: number;
  compatibility_description: string;
  created_at: string;
  updated_at: string;
}

// Create/Update Life Path Number Request
export interface LifePathNumberCreate {
  number: number;
  title: string;
  description: string;
  core_strengths: {
    strengths: string[];
  };
  growth_areas: {
    areas: string[];
  };
}

export interface LifePathNumberUpdate {
  number?: number;
  title?: string;
  description?: string;
  core_strengths?: {
    strengths: string[];
  };
  growth_areas?: {
    areas: string[];
  };
}

// Create/Update Life Path Compatibility Request
export interface LifePathCompatibilityCreate {
  life_path_id_1: number;
  life_path_id_2: number;
  compatibility_score: number;
  compatibility_description: string;
}

export interface LifePathCompatibilityUpdate {
  life_path_id_1?: number;
  life_path_id_2?: number;
  compatibility_score?: number;
  compatibility_description?: string;
}
