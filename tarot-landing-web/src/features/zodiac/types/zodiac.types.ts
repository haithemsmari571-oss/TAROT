// Zodiac Sign Model
export interface ZodiacSign {
  id: number;
  name: string;
  element: string;
  modality: string;
  ruling_planet: string;
  date_range_start: string; // MM-DD format
  date_range_end: string; // MM-DD format
  core_trait: string;
  signature_trait: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// Zodiac Compatibility Model
export interface ZodiacCompatibility {
  id: number;
  sign_id_1: number;
  sign_id_2: number;
  love_percentage: number;
  communication_percentage: number;
  emotional_bond_percentage: number;
  overall_harmony_percentage: number;
  elemental_insight: string;
  compatibility_description: string;
  created_at: string;
  updated_at: string;
}

// Create/Update Zodiac Sign Request
export interface ZodiacSignCreate {
  name: string;
  element: string;
  modality: string;
  ruling_planet: string;
  date_range_start: string;
  date_range_end: string;
  core_trait: string;
  signature_trait: string;
  description: string;
}

export interface ZodiacSignUpdate {
  name?: string;
  element?: string;
  modality?: string;
  ruling_planet?: string;
  date_range_start?: string;
  date_range_end?: string;
  core_trait?: string;
  signature_trait?: string;
  description?: string;
}

// Create/Update Zodiac Compatibility Request
export interface ZodiacCompatibilityCreate {
  sign_id_1: number;
  sign_id_2: number;
  love_percentage: number;
  communication_percentage: number;
  emotional_bond_percentage: number;
  overall_harmony_percentage: number;
  elemental_insight: string;
  compatibility_description: string;
}

export interface ZodiacCompatibilityUpdate {
  sign_id_1?: number;
  sign_id_2?: number;
  love_percentage?: number;
  communication_percentage?: number;
  emotional_bond_percentage?: number;
  overall_harmony_percentage?: number;
  elemental_insight?: string;
  compatibility_description?: string;
}
