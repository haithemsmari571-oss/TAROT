import axiosClient from "@/lib/axiosClient";
import type { LandingContentSection } from "../types/landingEditor.types";

interface LandingListResponse {
  sections: LandingContentSection[];
}

export const landingEditorApi = {
  getAll: async (): Promise<LandingContentSection[]> => {
    const response = await axiosClient.get<LandingListResponse>("/landing");
    return response.data.sections;
  },

  update: async (section: string, content: unknown): Promise<LandingContentSection> => {
    const response = await axiosClient.put<LandingContentSection>(`/admin/landing/${section}`, { content });
    return response.data;
  },
};
