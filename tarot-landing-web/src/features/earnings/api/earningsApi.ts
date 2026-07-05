import axiosClient from "@/lib/axiosClient";
import type { ActivityPeriod, ReaderActivityResponse } from "../types/earnings.types";

export const earningsApi = {
  /**
   * Per-psychic Reader Activity for a period (SUPERADMIN): minutes read,
   * sessions, unique clients, and the client spend each reader generated.
   * Client spend only — psychics are salaried, there is no reader cut.
   */
  getReaderActivity: async (
    period: ActivityPeriod = "all"
  ): Promise<ReaderActivityResponse> => {
    const response = await axiosClient.get(
      `/admin/psychics/activity?period=${period}`
    );
    return response.data;
  },
};
