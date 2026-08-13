import axiosClient from "../../../lib/axiosClient";

export interface OnboardingDraft {
  id: number;
  batch_id: string;
  row_index: number;
  status: "pending" | "error" | "created" | "skipped";
  error_reason: string | null;
  display_name: string | null;
  price_per_minute: number | null;
  bio: string | null;
  categories_csv: string | null;
  username: string | null;
  email: string | null;
  image_filename: string | null;
  preview_url: string | null;
  created_user_id: number | null;
}

export interface OnboardingBatch {
  batch_id: string;
  total: number;
  ready: number;
  errors: number;
  created: number;
  drafts: OnboardingDraft[];
}

export interface ConfirmResult {
  batch_id: string;
  created: number;
  skipped: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}

export const onboardingApi = {
  stage: async (manifest: File, images: File[], bioFiles: File[] = []): Promise<OnboardingBatch> => {
    const form = new FormData();
    form.append("manifest", manifest);
    images.forEach((f) => form.append("images", f));
    bioFiles.forEach((f) => form.append("bio_files", f));
    const res = await axiosClient.post<OnboardingBatch>("/admin/onboarding/psychics/stage", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  getBatch: async (batchId: string): Promise<OnboardingBatch> => {
    const res = await axiosClient.get<OnboardingBatch>(`/admin/onboarding/psychics/batches/${batchId}`);
    return res.data;
  },

  updateDraft: async (
    draftId: number,
    fields: Partial<Pick<OnboardingDraft, "display_name" | "price_per_minute" | "bio" | "username" | "email" | "categories_csv">>,
  ): Promise<OnboardingDraft> => {
    const res = await axiosClient.patch<OnboardingDraft>(`/admin/onboarding/psychics/drafts/${draftId}`, fields);
    return res.data;
  },

  confirm: async (batchId: string): Promise<ConfirmResult> => {
    const res = await axiosClient.post<ConfirmResult>(`/admin/onboarding/psychics/batches/${batchId}/confirm`);
    return res.data;
  },
};
