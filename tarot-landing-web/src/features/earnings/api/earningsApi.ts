import axiosClient from "@/lib/axiosClient";
import type {
  EarningsListResponse,
  EarningsFilters,
  EarningsSummary,
} from "../types/earnings.types";

export const earningsApi = {
  /**
   * Get earnings for the current psychic user
   * Fetches all transactions where the psychic earned money from chat sessions
   */
  getMyEarnings: async (
    filters?: EarningsFilters
  ): Promise<EarningsListResponse> => {
    const params = new URLSearchParams();

    if (filters?.status) params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.limit) params.append("limit", String(filters.limit));

    const response = await axiosClient.get(
      `/admin/psychics/earnings?${params.toString()}`
    );

    return {
      transactions: response.data.transactions || [],
      total: response.data.total || 0,
      page: response.data.page || 1,
      limit: response.data.limit || 50,
      pages: response.data.total_pages || 1,
    };
  },

  /**
   * Get earnings summary for the current psychic
   */
  getEarningsSummary: async (): Promise<EarningsSummary> => {
    const response = await axiosClient.get("/admin/psychics/earnings/summary");
    return response.data;
  },
};
