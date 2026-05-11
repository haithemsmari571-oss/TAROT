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
