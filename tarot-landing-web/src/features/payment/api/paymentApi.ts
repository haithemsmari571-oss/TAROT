import axiosClient from "@/lib/axiosClient";
import type {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  TopUpResponse,
  UnitPriceResponse,
  BuyOptionResponse,
} from "../types/payment.types";
import type { 
  TransactionListResponse, 
  TransactionFilters,
  UserBalance 
} from "@/features/ledger/types/transaction.types";

export const paymentApi = {
  /**
   * Get the unit price per point in cents (public endpoint)
   */
  getUnitPrice: async (): Promise<UnitPriceResponse> => {
    const response = await axiosClient.get("/payment/unit-price");
    return response.data;
  },

  /**
   * Create a Stripe checkout session for purchasing points
   */
  createCheckoutSession: async (
    request: CreateCheckoutSessionRequest
  ): Promise<CreateCheckoutSessionResponse> => {
    const response = await axiosClient.post(
      "/payment/create-checkout-session",
      request
    );
    return response.data;
  },

  /**
   * Request top-up for active chat (pauses chat + returns Stripe URL)
   */
  topupChat: async (chatId: number): Promise<TopUpResponse> => {
    const response = await axiosClient.post(`/chat/${chatId}/topup`);
    return response.data;
  },

  /**
   * Get current user's transaction history
   */
  getMyTransactions: async (
    filters?: TransactionFilters
  ): Promise<TransactionListResponse> => {
    const params = new URLSearchParams();

    if (filters?.transaction_type)
      params.append("transaction_type", filters.transaction_type);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.limit) params.append("limit", String(filters.limit));

    const response = await axiosClient.get(
      `/transactions/me?${params.toString()}`
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
   * Get current user's balance
   */
  getMyBalance: async (): Promise<UserBalance> => {
    const response = await axiosClient.get("/transactions/me/balance");
    return response.data;
  },

  /**
   * Get active buy options for point packages
   */
  getBuyOptions: async (): Promise<BuyOptionResponse[]> => {
    const response = await axiosClient.get("/buy-options");
    return response.data;
  },
};
