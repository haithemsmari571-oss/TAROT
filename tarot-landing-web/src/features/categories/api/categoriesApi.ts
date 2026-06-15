import axiosClient from "@/lib/axiosClient";
import type { Category, CategoryCreate, CategoryUpdate } from "../types/categories.types";

export const categoriesApi = {
  getCategories: async (): Promise<Category[]> => {
    const response = await axiosClient.get("/category/");
    return response.data;
  },

  getCategory: async (id: number): Promise<Category> => {
    const response = await axiosClient.get(`/category/${id}`);
    return response.data;
  },

  createCategory: async (data: CategoryCreate): Promise<Category> => {
    const response = await axiosClient.post("/category/", data);
    return response.data;
  },

  updateCategory: async (id: number, data: CategoryUpdate): Promise<Category> => {
    const response = await axiosClient.put(`/category/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: number): Promise<void> => {
    await axiosClient.delete(`/category/${id}`);
  },
};
