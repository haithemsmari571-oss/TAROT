import axiosClient from "@/lib/axiosClient";
import { Category } from "../types/category.types";

export const categoriesApi = {
  /**
   * Get all categories
   */
  getCategories: async (skip: number = 0, limit: number = 100): Promise<Category[]> => {
    const response = await axiosClient.get<Category[]>(`/category?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  /**
   * Get a single category by ID
   */
  getCategoryById: async (id: number): Promise<Category> => {
    const response = await axiosClient.get<Category>(`/category/${id}`);
    return response.data;
  },
};
