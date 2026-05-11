import axiosClient from "@/lib/axiosClient";
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
   * Change password
   */
  changePassword: async (data: ChangePasswordRequest): Promise<void> => {
    await axiosClient.post("/profile/me/change-password", data);
  },
};
