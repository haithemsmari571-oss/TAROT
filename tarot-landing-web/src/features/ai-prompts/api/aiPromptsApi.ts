import axiosClient from "@/lib/axiosClient";

export interface AiPromptListItem {
  key: string;
  name: string;
  description: string;
  model: string;
  status: string;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface AiPromptVariable {
  name: string;
  description: string;
}

export interface AiPromptDetail extends AiPromptListItem {
  prompt: string;
  default_prompt: string;
  variables: AiPromptVariable[];
  char_count: number;
}

export interface AiPromptVersion {
  id: number;
  text: string;
  char_count: number;
  created_at: string | null;
}

export interface AiPromptTestResult {
  variables: Record<string, string>;
  text: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export const aiPromptsApi = {
  list: async (): Promise<{ items: AiPromptListItem[]; configured: boolean }> => {
    const res = await axiosClient.get("/admin/ai-prompts");
    return res.data;
  },
  get: async (key: string): Promise<AiPromptDetail> => {
    const res = await axiosClient.get(`/admin/ai-prompts/${key}`);
    return res.data;
  },
  save: async (key: string, prompt: string): Promise<AiPromptDetail> => {
    const res = await axiosClient.put(`/admin/ai-prompts/${key}`, { prompt });
    return res.data;
  },
  restoreDefault: async (key: string): Promise<AiPromptDetail> => {
    const res = await axiosClient.post(`/admin/ai-prompts/${key}/restore-default`);
    return res.data;
  },
  versions: async (key: string): Promise<{ items: AiPromptVersion[] }> => {
    const res = await axiosClient.get(`/admin/ai-prompts/${key}/versions`);
    return res.data;
  },
  restoreVersion: async (key: string, versionId: number): Promise<AiPromptDetail> => {
    const res = await axiosClient.post(
      `/admin/ai-prompts/${key}/versions/${versionId}/restore`
    );
    return res.data;
  },
  test: async (
    key: string,
    variables?: Record<string, string>
  ): Promise<AiPromptTestResult> => {
    const res = await axiosClient.post(`/admin/ai-prompts/${key}/test`, { variables });
    return res.data;
  },
};
