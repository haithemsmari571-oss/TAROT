export interface Setting {
  id: number;
  key: string;
  value: string;
}

export interface SettingsListResponse {
  settings: Setting[];
}

export interface SettingUpdate {
  value: string;
}
