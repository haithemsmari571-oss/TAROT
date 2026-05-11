import { useState, useCallback } from "react";
import { transactionsApi } from "../api/transactionsApi";
import type {
  TransactionListResponse,
  TransactionFilters,
  Transaction,
  UserBalance,
} from "../types/transaction.types";

export const useTransactions = () => {
  const [transactions, setTransactions] = useState<TransactionListResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all transactions across all users
  const fetchAllTransactions = useCallback(async (filters?: TransactionFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsApi.getAllTransactions(filters);
      setTransactions(data);
      return data;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || "Failed to fetch transactions";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch transactions for a specific user
  const fetchUserTransactions = useCallback(
    async (userId: number, filters?: TransactionFilters) => {
      setLoading(true);
      setError(null);
      try {
        const data = await transactionsApi.getUserTransactions(userId, filters);
        setTransactions(data);
        return data;
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.detail || "Failed to fetch user transactions";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Get single transaction by ID
  const getTransactionById = useCallback(
    async (userId: number, transactionId: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await transactionsApi.getTransactionById(userId, transactionId);
        return data;
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.detail || "Failed to fetch transaction";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Get user balance
  const getUserBalance = useCallback(async (userId: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await transactionsApi.getUserBalance(userId);
      return data;
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || "Failed to fetch user balance";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    transactions,
    loading,
    error,
    fetchAllTransactions,
    fetchUserTransactions,
    getTransactionById,
    getUserBalance,
  };
};
