import axiosClient, { storeSessionTokens } from "@/lib/axiosClient";
import type {
  UserProfile,
  UpdateProfileRequest,
  ChangePasswordRequest,
  UploadProfilePictureResponse,
} from "../types/profile.types";

export const profileApi = {
  /**
   * Get current user's profile
   */
  getMyProfile: async (): Promise<UserProfile> => {
    const response = await axiosClient.get("/profile/me");
    return response.data;
  },

  /**
   * Update current user's profile (bio)
   */
  updateMyProfile: async (data: UpdateProfileRequest): Promise<UserProfile> => {
    const response = await axiosClient.patch("/profile/me", data);
    return response.data;
  },

  /**
   * Upload profile picture
   */
  uploadProfilePicture: async (file: File): Promise<UploadProfilePictureResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axiosClient.post("/profile/me/picture", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  /**
   * Change password. The server ends every other device's sign-in and answers
   * with new tokens for this one, which are kept so she stays signed in here.
   */
  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    const response = await axiosClient.post("/profile/me/change-password", data);
    if (response.data?.access_token) {
      storeSessionTokens(response.data);
    }
  },

  /**
   * Delete the signed-in client's own account (soft delete + anonymise)
   */
  deleteMyAccount: async (): Promise<void> => {
    await axiosClient.delete("/profile/me");
  },
};
