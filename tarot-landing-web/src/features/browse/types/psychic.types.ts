export interface PsychicCategory {
  id: number;
  title: string;
}

export interface PsychicAvailability {
  id: number;
  day_of_the_week: string;
  start_at: string;
  end_at: string;
}

export interface PsychicAvailabilityCreate {
  day_of_the_week: string;
  start_at: string;
  end_at: string;
}

export interface Psychic {
  id: number;
  username: string;
  email: string;
  price_per_second: number;
  bio: string;
  is_verified: boolean;
  categories: PsychicCategory[];
  availability: PsychicAvailability[];
  profile_picture_url: string;
  is_online: boolean;
  order?: number;
}

export interface PsychicCreate {
  username: string;
  email: string;
  password: string;
  price_per_second: number;
  bio: string;
  is_online: boolean;
  categories_ids: number[];
  availability: PsychicAvailabilityCreate[];
}

export interface PsychicUpdate {
  email?: string;
  is_online?: boolean;
  price_per_second?: number;
  categories_ids?: number[];
  availabilities_create?: PsychicAvailabilityCreate[];
  order?: number;

  bio?: string;
}

export interface PsychicFilters {
  is_online?: boolean;
  min_price?: number;
  max_price?: number;
  categories_ids?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}
