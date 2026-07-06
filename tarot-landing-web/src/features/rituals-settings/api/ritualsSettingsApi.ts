import axiosClient from "@/lib/axiosClient";

export interface GamificationSettings {
  rotation_window_hours: number;
  tasks_per_window: number;
  earned_redemption_cap_pct: number;
  earned_expiry_days: number;
}

export interface ContentRun {
  id: number;
  content_date: string;
  trigger: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  signs_ok: string[];
  signs_failed: { sign: string; error: string }[];
  output_tokens: number;
  cost_usd: number;
}

export interface ContentStatus {
  configured: boolean;
  next_scheduled_run: string;
  latest_run: ContentRun | null;
}

export const ritualsSettingsApi = {
  getSettings: async (): Promise<GamificationSettings> => {
    const res = await axiosClient.get("/admin/settings/gamification");
    return res.data;
  },
  updateSettings: async (s: GamificationSettings): Promise<GamificationSettings> => {
    const res = await axiosClient.put("/admin/settings/gamification", s);
    return res.data;
  },
  contentStatus: async (): Promise<ContentStatus> => {
    const res = await axiosClient.get("/admin/content/status");
    return res.data;
  },
  generateNow: async (): Promise<{ started: boolean; content_date: string }> => {
    const res = await axiosClient.post("/admin/content/generate-now");
    return res.data;
  },
};
