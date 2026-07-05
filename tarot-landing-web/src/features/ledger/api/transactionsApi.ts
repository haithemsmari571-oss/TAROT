import axiosClient from "@/lib/axiosClient";
import type {
  TransactionListResponse,
  TransactionFilters,
  Transaction,
  UserBalance,
} from "../types/transaction.types";

export interface TransactionsSummary {
  total_credits: number;
  total_debits: number;
  net_flow: number;
  count: number;
  by_type: Record<string, { amount: number; count: number }>;
}

export const transactionsApi = {
  /**
   * Get transaction history for a specific user (admin endpoint)
   */
  getUserTransactions: async (
    userId: number,
    filters?: TransactionFilters
  ): Promise<TransactionListResponse> => {
    const params = new URLSearchParams();

    if (filters?.transaction_type)
      params.append("transaction_type", filters.transaction_type);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.limit) params.append("limit", String(filters.limit));

    const response = await axiosClient.get(
      `/admin/transactions/users/${userId}/transactions?${params.toString()}`
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
   * Get all transactions across all users (admin endpoint)
   */
  getAllTransactions: async (
    filters?: TransactionFilters
  ): Promise<TransactionListResponse> => {
    const params = new URLSearchParams();

    if (filters?.transaction_type)
      params.append("transaction_type", filters.transaction_type);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.user_id) params.append("user_id", String(filters.user_id));
    if (filters?.search) params.append("search", filters.search);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.limit) params.append("limit", String(filters.limit));
    if (filters?.date_from) params.append("date_from", filters.date_from);
    if (filters?.date_to) params.append("date_to", filters.date_to);
    if (filters?.category) params.append("category", filters.category);

    const response = await axiosClient.get(
      `/admin/transactions/all?${params.toString()}`
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
   * REAL period totals for the current filters (all matching rows, not a page).
   */
  getSummary: async (filters?: TransactionFilters): Promise<TransactionsSummary> => {
    const params = new URLSearchParams();
    if (filters?.transaction_type)
      params.append("transaction_type", filters.transaction_type);
    if (filters?.status) params.append("status", filters.status);
    if (filters?.user_id) params.append("user_id", String(filters.user_id));
    if (filters?.search) params.append("search", filters.search);
    if (filters?.date_from) params.append("date_from", filters.date_from);
    if (filters?.date_to) params.append("date_to", filters.date_to);
    if (filters?.category) params.append("category", filters.category);

    const response = await axiosClient.get(
      `/admin/transactions/summary?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get balance for a specific user (admin endpoint)
   */
  getUserBalance: async (userId: number): Promise<UserBalance> => {
    const response = await axiosClient.get(
      `/admin/transactions/users/${userId}/balance`
    );
    return response.data;
  },

  /**
   * Get detailed information about a specific transaction
   */
  getTransactionById: async (
    userId: number,
    transactionId: number
  ): Promise<Transaction> => {
    // Note: The backend doesn't have a dedicated admin endpoint for single transaction
    // We'll get all user transactions and find the specific one
    const response = await axiosClient.get(
      `/admin/transactions/users/${userId}/transactions?limit=1000`
    );
    const transactions = response.data.transactions || [];
    const transaction = transactions.find((t: Transaction) => t.id === transactionId);

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    return transaction;
  },
};
