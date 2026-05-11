import { useState } from "react";
import { paymentApi } from "../api/paymentApi";
import type { CreateCheckoutSessionRequest, UnitPriceResponse, BuyOptionResponse } from "../types/payment.types";
import type { 
  TransactionListResponse, 
  TransactionFilters,
  UserBalance 
} from "@/features/ledger/types/transaction.types";

export const usePayment = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionListResponse | null>(null);
  const [balance, setBalance] = useState<UserBalance | null>(null);
  const [unitPrice, setUnitPrice] = useState<UnitPriceResponse | null>(null);
  const [buyOptions, setBuyOptions] = useState<BuyOptionResponse[] | null>(null);

  const createCheckoutSession = async (request: CreateCheckoutSessionRequest) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentApi.createCheckoutSession(request);
      // Redirect to Stripe checkout
      window.location.href = response.url;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create checkout session";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchMyTransactions = async (filters?: TransactionFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentApi.getMyTransactions(filters);
      setTransactions(data);
      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch transactions";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchMyBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentApi.getMyBalance();
      setBalance(data);
      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch balance";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchUnitPrice = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentApi.getUnitPrice();
      setUnitPrice(data);
      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch unit price";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchBuyOptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await paymentApi.getBuyOptions();
      setBuyOptions(data);
      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch buy options";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const topupChat = async (chatId: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await paymentApi.topupChat(chatId);
      // Redirect to Stripe checkout
      window.location.href = response.url;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to initiate top-up";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    transactions,
    balance,
    unitPrice,
    buyOptions,
    createCheckoutSession,
    fetchMyTransactions,
    fetchMyBalance,
    fetchUnitPrice,
    fetchBuyOptions,
    topupChat,
  };
};
