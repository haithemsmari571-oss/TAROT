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
  /** per-message billing: the price of one client message, null or absent when unset */
  price_per_message?: number | null;
  bio: string;
  is_verified: boolean;
  categories: PsychicCategory[];
  availability: PsychicAvailability[];
  profile_picture_url: string;
  is_online: boolean;
  /** when offline: the ISO instant the reader's UK hours next open; null while online or with no hours */
  next_online_at?: string | null;
  order?: number;
  /** one reader's page only (GET /psychic/{id}): whether the viewer may write a new review of her now; null on the roster */
  can_review?: boolean | null;
  /** her profile (ROUND54), null until the owner fills it in */
  years_experience?: number | null;
  /** one of the twelve signs as the site writes them ("Scorpio") */
  zodiac_sign?: string | null;
  languages?: string[] | null;
  /** her countries as ISO codes, "MA" or "GB,RO" (ROUND56, client-app/countries.ts); null when not filled in */
  ethnicity?: string | null;
}

export interface PsychicCreate {
  username: string;
  email: string;
  password: string;
  price_per_second: number;
  price_per_message?: number | null;
  bio: string;
  is_online: boolean;
  categories_ids: number[];
  availability: PsychicAvailabilityCreate[];
}

export interface PsychicUpdate {
  email?: string;
  is_online?: boolean;
  price_per_second?: number;
  price_per_message?: number | null;
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
