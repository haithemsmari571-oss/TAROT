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
  /** ISO date "YYYY-MM-DD", null until she gives one (schemas/user.py:82). */
  date_of_birth?: string | null;
  /** "WOMAN" | "MAN" | "OTHER" | "NOT_STATED" (schemas/user.py:83). */
  gender?: string;
  price_per_second?: number;
  /** Emails about her conversations, a reader's reply and a refund
   *  (services/reply_emails.py). On unless she turns them off in the You tab. */
  reply_emails: boolean;
  created_at: string;
}

/** What PATCH /profile/me takes, UserProfileUpdate (schemas/user.py:32-67).
 *  A field left out is left alone (services/users.py:385, exclude_unset). */
export interface UpdateProfileRequest {
  /** 3 to 50 characters once trimmed (schemas/user.py:43-53). */
  username?: string;
  /** Up to 500 characters (schemas/user.py:55-60); null clears it. */
  bio?: string | null;
  /** ISO date, not in the future and 18 or over (schemas/user.py UserProfileUpdate);
   *  once sent it may not be null. */
  date_of_birth?: string | null;
  /** "WOMAN" | "MAN" | "OTHER" | "NOT_STATED" (schemas/user.py:41). Edited on
   *  /app/you/details (ClientEditDetailsScreen.tsx). */
  gender?: string;
  /** The You tab's switch (ClientYouScreen.tsx); never null. */
  reply_emails?: boolean;
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
