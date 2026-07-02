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

export interface Psychic {
  id: number;
  username: string;
  email?: string;
  price_per_second: number | null;
  bio: string | null;
  is_verified: boolean;
  categories: PsychicCategory[];
  availability: PsychicAvailability[];
  profile_picture_url: string | null;
  is_online: boolean;
  order?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}
