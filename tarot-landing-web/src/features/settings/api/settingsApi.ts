import axiosClient from "@/lib/axiosClient";
import type {
  SettingsListResponse,
  Setting,
  SettingUpdate,
} from "../types/settings.types";

export const settingsApi = {
  /**
   * Get all settings
   */
  getSettings: async (): Promise<SettingsListResponse> => {
    const response = await axiosClient.get("/admin/settings");
    return response.data;
  },

  /**
   * Update a setting by key
   */
  updateSetting: async (
    key: string,
    data: SettingUpdate
  ): Promise<Setting> => {
    const response = await axiosClient.patch(`/admin/settings/${key}`, data);
    return response.data;
  },
};
