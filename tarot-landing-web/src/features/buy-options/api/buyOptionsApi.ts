import axiosClient from "@/lib/axiosClient";
import type { BuyOption, BuyOptionCreate, BuyOptionUpdate } from "../types/buyOptions.types";

export const buyOptionsApi = {
  getBuyOptions: async (): Promise<BuyOption[]> => {
    const response = await axiosClient.get("/admin/buy-options/");
    return response.data;
  },

  getBuyOption: async (id: number): Promise<BuyOption> => {
    const response = await axiosClient.get(`/admin/buy-options/${id}/`);
    return response.data;
  },

  createBuyOption: async (data: BuyOptionCreate): Promise<BuyOption> => {
    const response = await axiosClient.post("/admin/buy-options/", data);
    return response.data;
  },

  updateBuyOption: async (id: number, data: BuyOptionUpdate): Promise<BuyOption> => {
    const response = await axiosClient.put(`/admin/buy-options/${id}/`, data);
    return response.data;
  },

  deleteBuyOption: async (id: number): Promise<void> => {
    await axiosClient.delete(`/admin/buy-options/${id}/`);
  },
};
