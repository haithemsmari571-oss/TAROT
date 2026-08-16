export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
  balance: number;
  is_verified: boolean;
  is_online: boolean;
  profile_picture_path?: string;
  bio?: string;
  price_per_second?: number;
  created_at: string;
}

export interface UpdateProfileRequest {
  bio?: string;
  /** "WOMAN" | "MAN" | "OTHER" | "NOT_STATED". The API accepts it on PATCH /profile/me;
   *  there is no client-facing screen that edits profile fields yet — see the report. */
  gender?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UploadProfilePictureResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  balance: number;
  is_verified: boolean;
  is_online: boolean;
  profile_picture_path: string;
  bio?: string;
  price_per_second?: number;
  created_at: string;
}
