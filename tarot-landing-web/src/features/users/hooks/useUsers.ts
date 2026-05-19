import { useState, useCallback } from "react";
import { usersApi } from "../api/usersApi";
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

export const useUsers = () => {
  const [users, setUsers] = useState<AdminUserListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch users with filters
  const fetchUsers = useCallback(async (filters?: UserFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersApi.getUsers(filters);
      setUsers(data);
      return data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || "Failed to fetch users";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Get single user by ID
  const getUserById = useCallback(async (userId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersApi.getUserById(userId);
      return data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || "Failed to fetch user";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new user
  const createUser = useCallback(async (userData: AdminUserCreate) => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersApi.createUser(userData);
      // Refresh the users list after creation
      await fetchUsers();
      return data;
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || "Failed to create user";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchUsers]);

  // Update user
  const updateUser = useCallback(
    async (userId: number, userData: AdminUserUpdate) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.updateUser(userId, userData);
        // Refresh the users list after update
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to update user";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Delete user
  const deleteUser = useCallback(
    async (userId: number) => {
      setLoading(true);
      setError(null);
      try {
        await usersApi.deleteUser(userId);
        // Refresh the users list after deletion
        await fetchUsers();
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to delete user";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Suspend user
  const suspendUser = useCallback(
    async (userId: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.suspendUser(userId);
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to suspend user";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Activate user
  const activateUser = useCallback(
    async (userId: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.activateUser(userId);
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to activate user";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Update user role
  const updateUserRole = useCallback(
    async (userId: number, roleData: UserRoleUpdate) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.updateUserRole(userId, roleData);
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to update user role";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Adjust user balance
  const adjustBalance = useCallback(
    async (userId: number, adjustment: AdminBalanceAdjustment) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.adjustBalance(userId, adjustment);
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to adjust balance";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Gift balance to user
  const giftBalance = useCallback(
    async (userId: number, payload: GiftBalancePayload) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.giftBalance(userId, payload);
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to gift balance";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  // Verify user
  const verifyUser = useCallback(
    async (userId: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usersApi.verifyUser(userId);
        await fetchUsers();
        return data;
      } catch (err: any) {
        const errorMessage = err.response?.data?.detail || "Failed to verify user";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [fetchUsers]
  );

  return {
    users,
    loading,
    error,
    fetchUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    suspendUser,
    activateUser,
    updateUserRole,
    adjustBalance,
    giftBalance,
    verifyUser,
  };
};
