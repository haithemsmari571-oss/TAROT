import axiosClient from "@/lib/axiosClient";
import type {
  AdminUserListResponse,
  AdminUserDetail,
  UserFilters,
  AdminUserCreate,
  AdminUserUpdate,
  UserRoleUpdate,
  AdminBalanceAdjustment,
  GiftBalancePayload,
} from "../types/user.types";

export const usersApi = {
  /**
   * Get paginated list of users with optional filters
   */
  getUsers: async (filters?: UserFilters): Promise<AdminUserListResponse> => {
    const params = new URLSearchParams();
    
    if (filters?.search) params.append("search", filters.search);
    if (filters?.role) params.append("role", filters.role);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.is_verified !== undefined) params.append("is_verified", String(filters.is_verified));
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.limit) params.append("limit", String(filters.limit));
    if (filters?.sort_by) params.append("sort_by", filters.sort_by);
    if (filters?.sort_order) params.append("sort_order", filters.sort_order);

    const response = await axiosClient.get(`/admin/users?${params.toString()}`);
    return response.data;
  },

  /**
   * Get detailed information about a specific user
   */
  getUserById: async (userId: number): Promise<AdminUserDetail> => {
    const response = await axiosClient.get(`/admin/users/${userId}`);
    return response.data;
  },

  /**
   * Create a new user (admin only)
   */
  createUser: async (userData: AdminUserCreate): Promise<AdminUserDetail> => {
    const response = await axiosClient.post("/admin/users", userData);
    return response.data;
  },

  /**
   * Update an existing user
   */
  updateUser: async (
    userId: number,
    userData: AdminUserUpdate
  ): Promise<AdminUserDetail> => {
    const response = await axiosClient.patch(`/admin/users/${userId}`, userData);
    return response.data;
  },

  /**
   * Soft delete a user (sets status to SUSPENDED)
   */
  deleteUser: async (userId: number): Promise<void> => {
    await axiosClient.delete(`/admin/users/${userId}`);
  },

  /**
   * Suspend a user account
   */
  suspendUser: async (userId: number): Promise<AdminUserDetail> => {
    const response = await axiosClient.patch(`/admin/users/${userId}/suspend`);
    return response.data;
  },

  /**
   * Activate a suspended user account
   */
  activateUser: async (userId: number): Promise<AdminUserDetail> => {
    const response = await axiosClient.patch(`/admin/users/${userId}/activate`);
    return response.data;
  },

  /**
   * Change a user's role (superadmin only)
   */
  updateUserRole: async (
    userId: number,
    roleData: UserRoleUpdate
  ): Promise<AdminUserDetail> => {
    const response = await axiosClient.patch(
      `/admin/users/${userId}/role`,
      roleData
    );
    return response.data;
  },

  /**
   * Adjust user balance (credit or debit)
   */
  adjustBalance: async (
    userId: number,
    adjustment: AdminBalanceAdjustment
  ): Promise<AdminUserDetail> => {
    const response = await axiosClient.post(
      `/admin/users/${userId}/balance/adjust`,
      adjustment
    );
    return response.data;
  },

  /**
   * Gift balance to a user
   */
  giftBalance: async (
    userId: number,
    payload: GiftBalancePayload
  ): Promise<{ transaction_id: number; user_id: number; amount: number; new_balance: number; message: string; status: string }> => {
    const response = await axiosClient.post(`/admin/users/${userId}/gift`, payload);
    return response.data;
  },

  /**
   * Force verify a user (bypass email verification)
   */
  verifyUser: async (userId: number): Promise<AdminUserDetail> => {
    const response = await axiosClient.post(`/admin/users/${userId}/verify`);
    return response.data;
  },
};
